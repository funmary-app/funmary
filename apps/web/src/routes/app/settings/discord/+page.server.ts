// 利用者の Discord 連携の設定 (#163)。連携する、解除する、認可コードを受け取って完成させる。
import { fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import {
	DEFAULT_CHANNEL_KINDS,
	kindSetting,
	type DiscordDestination,
	type DiscordLink,
	type DiscordLinkKindSettings,
} from '@funmary/db';
import { CHANNEL_KIND_OPTIONS, parseChannelKinds } from '#lib/server/channel-kind-form.ts';
import { parseDailyDigestForm } from '#lib/server/daily-digest-form.ts';
import {
	completeDiscordLink,
	ensureChannel,
	openLinkState,
	prepareChannel,
	sealLinkState,
	type InitialDestination,
} from '#lib/server/discord-link.ts';
import {
	DISCORD_JOIN_ROLE_KEY,
	readDiscordJoinRole,
	resolveJoinRoleIds,
} from '#lib/server/discord-join-role.ts';
import { getServices } from '#lib/server/services.ts';
import { SUPPORT_INVITES_KEY, publicInvite, readInvites } from '#lib/server/support-invites.ts';
import { requireSignedIn } from '#lib/server/admin.ts';

const isInitialDestination = (value: unknown): value is InitialDestination =>
	value === 'thread' || value === 'dm';

const isDestinationChoice = (value: unknown): value is DiscordDestination =>
	value === 'thread' || value === 'dm' || value === 'both';

/** 失敗の中身をログに残し、画面向けの文を返す */
function describePrepareFailure(error: unknown, destination: InitialDestination): string {
	getServices()
		.log.withTag('discord-link')
		.warn(
			`Discord 連携の送り先の用意に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
		);
	return destination === 'dm'
		? 'DM を開けませんでした。サーバーのメンバーからの DM を許可しているか確かめてください。もう一度お試しください。'
		: 'スレッドの用意に失敗しました。もう一度お試しください。';
}

/**
 * 種類ごとの送り先の設定を保存する。使う送り先 (スレッドか DM) のチャンネルがまだ無ければ、先に用意する
 */
async function applyKindSettings(
	current: DiscordLink,
	settings: DiscordLinkKindSettings,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const { discord } = getServices();
	const { link } = discord;
	if (!discord.bot) return { ok: false, error: 'Bot が設定されていません。' };
	const needs = (destination: InitialDestination) =>
		Object.values(settings).some(
			(s) => s?.destination === destination || s?.destination === 'both',
		);

	for (const destination of ['thread', 'dm'] as const) {
		const have = destination === 'thread' ? current.threadChannelId : current.dmChannelId;
		if (!needs(destination) || have) continue;
		try {
			const prepared = await ensureChannel(
				discord.bot,
				link.linksChannelId(),
				current.discordUserId,
				destination,
				current,
			);
			if ('error' in prepared) return { ok: false, error: prepared.error };
			link.store.setChannel(current.userId, destination, prepared.channelId);
		} catch (error) {
			return { ok: false, error: describePrepareFailure(error, destination) };
		}
	}
	link.store.setKindSettings(current.userId, settings);
	return { ok: true };
}

export const load: ServerLoad = async ({ locals, url }) => {
	requireSignedIn(locals);
	const { discord, dailyDigest, settings, log } = getServices();
	const { link } = discord;

	const invites = readInvites(settings.get(SUPPORT_INVITES_KEY));
	const joinRoleIds = resolveJoinRoleIds(
		readDiscordJoinRole(settings.get(DISCORD_JOIN_ROLE_KEY)),
		invites,
	);

	const code = url.searchParams.get('code');
	const sealedState = url.searchParams.get('state');
	if (code && sealedState && link.oauth) {
		const state = openLinkState(link.stateBox, sealedState, new Date());
		const callback =
			!state || state.userId !== locals.user.id
				? { ok: false, message: '連携の有効期限が切れました。もう一度お試しください。' }
				: await completeDiscordLink(
						{
							oauth: link.oauth,
							bot: discord.bot,
							store: link.store,
							linksChannelId: link.linksChannelId(),
							joinRoleIds,
							log: log.withTag('discord-link'),
						},
						{ code, state },
						new Date(),
					);
		// 認可コードは 1 回しか使えない。URL に残したままだと、フォームの送信などで読み直すたびに同じコードを Discord に送り直してしまい、2 回目からは必ず失敗する。処理したらすぐ URL から消す
		const params = new URLSearchParams({
			linked: callback.ok ? 'ok' : 'error',
			message: callback.message,
		});
		redirect(303, `${url.pathname}?${params}`);
	}

	const linkedParam = url.searchParams.get('linked');
	const callback =
		linkedParam === null
			? null
			: { ok: linkedParam === 'ok', message: url.searchParams.get('message') ?? '' };

	const current = link.store.findByUser(locals.user.id);
	const { channels } = getServices();
	return {
		configured: link.configured,
		enabled: link.enabled(),
		linked: current
			? { hasThread: current.threadChannelId !== null, hasDm: current.dmChannelId !== null }
			: null,
		digest: current ? dailyDigest.get(locals.user.id) : null,
		// 届ける通知の種類 (#163)。連携していなければ null
		kinds: current
			? [
					...(channels.discordLinkChannel(locals.user.id)?.notificationKinds ??
						DEFAULT_CHANNEL_KINDS),
				]
			: null,
		kindOptions: CHANNEL_KIND_OPTIONS,
		// 種類ごとの送り先とメンション (#163)。連携していなければ null
		routing: current
			? CHANNEL_KIND_OPTIONS.map((option) => ({
					kind: option.kind,
					label: option.label,
					...kindSetting(current.kindSettings, option.kind),
				}))
			: null,
		callback,
		supportInvite: publicInvite(invites, new Date()),
	};
};

export const actions: Actions = {
	/** Discord の認可の画面へ移る */
	link: async ({ request, locals }) => {
		requireSignedIn(locals);
		const { discord } = getServices();
		const { link } = discord;
		if (!link.configured || !link.enabled() || !link.oauth) {
			return fail(400, { error: 'いまは Discord 連携を使えません。' });
		}
		const form = await request.formData();
		const destination = form.get('destination');
		if (!isInitialDestination(destination)) return fail(400, { error: '入力が足りません。' });
		const sealed = sealLinkState(link.stateBox, {
			userId: locals.user.id,
			destination,
			startedAt: Date.now(),
		});
		redirect(303, link.oauth.authorizationUrl(sealed));
	},
	/** 予定のまとめ (#207) の設定を保存する */
	digest: async ({ request, locals }) => {
		requireSignedIn(locals);
		const { discord, dailyDigest } = getServices();
		if (!discord.link.store.findByUser(locals.user.id))
			return fail(400, { error: '連携していません。' });
		const parsed = parseDailyDigestForm(await request.formData(), dailyDigest.get(locals.user.id));
		if (!parsed.ok) return fail(400, { error: parsed.error });
		dailyDigest.save(locals.user.id, parsed.settings, new Date());
		return { message: '予定のまとめの設定を保存しました。' };
	},
	/** 届ける通知の種類を保存する (#163) */
	kinds: async ({ request, locals }) => {
		requireSignedIn(locals);
		const { channels, discord } = getServices();
		if (!discord.link.store.findByUser(locals.user.id)) {
			return fail(400, { error: '連携していません。' });
		}
		const kinds = parseChannelKinds(await request.formData());
		if (!kinds) return fail(400, { error: '届ける通知の種類を、1 つ以上選んでください。' });
		channels.updateDiscordLinkKinds(locals.user.id, kinds);
		return { message: '届ける通知の種類を保存しました。' };
	},
	/** 種類ごとに、送り先 (スレッド/DM/両方) とメンションを決める (#163) */
	routing: async ({ request, locals }) => {
		requireSignedIn(locals);
		const { discord } = getServices();
		const current = discord.link.store.findByUser(locals.user.id);
		if (!current) return fail(400, { error: '連携していません。' });
		const form = await request.formData();
		const settings: DiscordLinkKindSettings = {};
		for (const option of CHANNEL_KIND_OPTIONS) {
			const destination = form.get(`destination_${option.kind}`);
			if (!isDestinationChoice(destination)) return fail(400, { error: '入力が足りません。' });
			settings[option.kind] = { destination, mention: form.get(`mention_${option.kind}`) === 'on' };
		}
		const result = await applyKindSettings(current, settings);
		if (!result.ok) return fail(502, { error: result.error });
		return { message: '通知先を保存しました。' };
	},
	/** すべての種類に、同じ送り先とメンションを、まとめて適用する */
	routingAll: async ({ request, locals }) => {
		requireSignedIn(locals);
		const { discord } = getServices();
		const current = discord.link.store.findByUser(locals.user.id);
		if (!current) return fail(400, { error: '連携していません。' });
		const form = await request.formData();
		const destination = form.get('destination');
		if (!isDestinationChoice(destination)) return fail(400, { error: '入力が足りません。' });
		const mention = form.get('mention') === 'on';
		const settings: DiscordLinkKindSettings = Object.fromEntries(
			CHANNEL_KIND_OPTIONS.map((option) => [option.kind, { destination, mention }]),
		);
		const result = await applyKindSettings(current, settings);
		if (!result.ok) return fail(502, { error: result.error });
		return { message: 'すべての種類に、まとめて適用しました。' };
	},
	/** 連携を解除する。Discord に接続できなくても、必ず成功する */
	unlink: ({ locals }) => {
		requireSignedIn(locals);
		const { discord } = getServices();
		const { link } = discord;
		const removed = link.store.remove(locals.user.id);
		if (!removed) return fail(400, { error: '連携していません。' });
		if (discord.bot) {
			if (removed.threadChannelId) void discord.bot.archiveThread(removed.threadChannelId);
			if (link.oauth) void link.oauth.revoke(removed.accessToken);
		}
		return { message: 'Discord との連携を解除しました。' };
	},
	/** いまのスレッドをアーカイブする (消しはしない)。次に通知が届くと、自動でアーカイブが解ける */
	archiveThread: async ({ locals }) => {
		requireSignedIn(locals);
		const { discord } = getServices();
		const current = discord.link.store.findByUser(locals.user.id);
		if (!current) return fail(400, { error: '連携していません。' });
		if (!current.threadChannelId) return fail(400, { error: 'スレッドがありません。' });
		if (!discord.bot) return fail(400, { error: 'Bot が設定されていません。' });
		await discord.bot.archiveThread(current.threadChannelId);
		return {
			message: 'スレッドをアーカイブしました。次に通知が届くと、自動でアーカイブが解けます。',
		};
	},
	/** いまのスレッドを完全に削除する。種類ごとの設定でスレッドを使っていれば、あらためて用意が要る */
	deleteThread: async ({ locals }) => {
		requireSignedIn(locals);
		const { discord } = getServices();
		const current = discord.link.store.findByUser(locals.user.id);
		if (!current) return fail(400, { error: '連携していません。' });
		if (!current.threadChannelId) return fail(400, { error: 'スレッドがありません。' });
		if (!discord.bot) return fail(400, { error: 'Bot が設定されていません。' });
		try {
			await discord.bot.deleteThread(current.threadChannelId);
		} catch (error) {
			return fail(502, { error: describePrepareFailure(error, 'thread') });
		}
		discord.link.store.setChannel(locals.user.id, 'thread', null);
		return {
			message:
				'スレッドを削除しました。スレッドを使う種類の設定があれば、送り先の設定を保存し直すと作り直されます。',
		};
	},
	/** いまのスレッドを削除して、新しいスレッドを作る */
	recreateThread: async ({ locals }) => {
		requireSignedIn(locals);
		const { discord } = getServices();
		const { link } = discord;
		const current = link.store.findByUser(locals.user.id);
		if (!current) return fail(400, { error: '連携していません。' });
		if (!discord.bot) return fail(400, { error: 'Bot が設定されていません。' });
		let prepared: { channelId: string } | { error: string };
		try {
			prepared = await prepareChannel(
				discord.bot,
				'thread',
				link.linksChannelId(),
				current.discordUserId,
			);
		} catch (error) {
			prepared = { error: describePrepareFailure(error, 'thread') };
		}
		if ('error' in prepared) return fail(502, { error: prepared.error });
		if (current.threadChannelId) {
			const oldChannelId = current.threadChannelId;
			void discord.bot.deleteThread(oldChannelId).catch(() => {});
		}
		link.store.setChannel(locals.user.id, 'thread', prepared.channelId);
		return { message: '新しいスレッドを作りました。' };
	},
};
