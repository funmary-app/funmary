// 管理用の Discord の Bot の設定。チャンネルとロールを、Bot が作ったものを使うか、既存のものに置き換えるかを決める。
// Discord に接続するのは、管理者がこの画面で押したときだけ。トークンは画面にも応答にも出さない。
import { fail, type Actions, type ServerLoad } from '@sveltejs/kit';
import { ADMIN_CHANNELS, DiscordApiError, ensureLayout, type AdminChannel } from '@funmary/notify';
import { requireAdmin } from '#lib/server/admin.ts';
import {
	changeMemberRole,
	replaceEntry,
	toDiscordView,
	useBot,
} from '#lib/server/discord-admin.ts';
import {
	DISCORD_JOIN_ROLE_KEY,
	parseDiscordJoinRoleForm,
	readDiscordJoinRole,
} from '#lib/server/discord-join-role.ts';
import { getServices } from '#lib/server/services.ts';
import { SUPPORT_INVITES_KEY, readInvites } from '#lib/server/support-invites.ts';

const NO_BOT =
	'Bot が設定されていません。環境変数 DISCORD_BOT_TOKEN と DISCORD_GUILD_ID を書いて、再起動してください。';

/** Discord の失敗を、画面に出せる文にする。秘密の値は含まれない */
const describeError = (error: unknown) =>
	error instanceof DiscordApiError
		? error.message
		: 'Discord に接続できませんでした。しばらくしてから、もう一度お試しください。';

export const load: ServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const { discord, settings } = getServices();
	return {
		view: toDiscordView(discord.bot, discord.layout(), {
			available: discord.presence.available,
			enabled: discord.presence.enabled(),
		}),
		link: {
			configured: discord.link.configured,
			enabled: discord.link.enabled(),
		},
		// 参加したときに付けるロール (#163)。独自に選んだロールの選択肢に使う
		guildRoles: discord.bot ? await discord.bot.listRoles() : [],
		joinRole: readDiscordJoinRole(settings.get(DISCORD_JOIN_ROLE_KEY)),
		invites: readInvites(settings.get(SUPPORT_INVITES_KEY)),
	};
};

export const actions: Actions = {
	/** 足りないチャンネルとロールを作る。何度押しても同じ結果になる */
	ensure: async ({ locals }) => {
		requireAdmin(locals);
		const { discord } = getServices();
		if (!discord.bot) return fail(400, { error: NO_BOT });
		try {
			const { layout, actions: done } = await ensureLayout(discord.bot, discord.layout());
			discord.saveLayout(layout);
			return {
				message:
					done.length === 0
						? 'チャンネルとロールは、すべてそろっています。'
						: `整えました: ${done.join('、')}`,
			};
		} catch (error) {
			return fail(502, { error: describeError(error) });
		}
	},
	/** チャンネルかロールを、管理者が指定した ID のものに置き換える */
	replace: async ({ request, locals }) => {
		requireAdmin(locals);
		const { discord } = getServices();
		if (!discord.bot) return fail(400, { error: NO_BOT });
		const form = await request.formData();
		const kind = form.get('kind') === 'role' ? 'role' : 'channel';
		const name = form.get('name');
		const id = form.get('id');
		if (typeof name !== 'string' || typeof id !== 'string') {
			return fail(400, { error: '入力が足りません。' });
		}
		try {
			const result = await replaceEntry(discord.bot, discord.layout(), kind, name, id);
			if (!result.ok) return fail(400, { error: result.error });
			discord.saveLayout(result.layout);
			return { message: `${name} を、指定した ID のものに置き換えました。` };
		} catch (error) {
			return fail(502, { error: describeError(error) });
		}
	},
	/** 置き換えを取り消して、Bot に任せる。次に整えるときに、Bot が探して使うか、作る */
	useBot: async ({ request, locals }) => {
		requireAdmin(locals);
		const { discord } = getServices();
		const form = await request.formData();
		const kind = form.get('kind') === 'role' ? 'role' : 'channel';
		const name = form.get('name');
		if (typeof name !== 'string') return fail(400, { error: '入力が足りません。' });
		discord.saveLayout(useBot(discord.layout(), kind, name));
		return {
			message: `${name} を Bot に任せます。「チャンネルとロールを整える」を押してください。`,
		};
	},
	/** Discord のユーザーに、ロールを付ける、または外す */
	role: async ({ request, locals }) => {
		requireAdmin(locals);
		const { discord } = getServices();
		if (!discord.bot) return fail(400, { error: NO_BOT });
		const form = await request.formData();
		const userId = form.get('userId');
		const name = form.get('name');
		if (typeof userId !== 'string' || typeof name !== 'string') {
			return fail(400, { error: '入力が足りません。' });
		}
		const result = await changeMemberRole(
			discord.bot,
			discord.layout(),
			form.get('action') === 'remove' ? 'remove' : 'add',
			name,
			userId,
		);
		return result.ok ? { message: result.message } : fail(400, { error: result.error });
	},
	/** Bot のオンライン表示を、入れる、切る */
	presence: async ({ request, locals }) => {
		requireAdmin(locals);
		const { discord } = getServices();
		const enabled = (await request.formData()).get('enabled') === 'true';
		discord.presence.setEnabled(enabled);
		return {
			message: enabled ? 'オンライン表示を入れました。' : 'オンライン表示を切りました。',
		};
	},
	/** 利用者の Discord 連携 (#163) を、入れる、切る */
	linking: async ({ request, locals }) => {
		requireAdmin(locals);
		const { discord } = getServices();
		const enabled = (await request.formData()).get('enabled') === 'true';
		discord.link.setEnabled(enabled);
		return {
			message: enabled
				? '利用者の Discord 連携を有効にしました。'
				: '利用者の Discord 連携を無効にしました。',
		};
	},
	/** 参加したときに付けるロールを保存する (#163) */
	joinRole: async ({ request, locals }) => {
		requireAdmin(locals);
		const { settings } = getServices();
		const parsed = parseDiscordJoinRoleForm(await request.formData());
		if (!parsed.ok) return fail(400, { error: parsed.error });
		settings.set(DISCORD_JOIN_ROLE_KEY, parsed.value, new Date());
		return { message: '参加したときに付けるロールを保存しました。' };
	},
	/** チャンネルに、テストのメッセージを送る */
	test: async ({ request, locals }) => {
		requireAdmin(locals);
		const { discord } = getServices();
		if (!discord.bot) return fail(400, { error: NO_BOT });
		const name = (await request.formData()).get('name');
		const channel = ADMIN_CHANNELS.find((candidate: AdminChannel) => candidate === name);
		const entry = channel ? discord.layout().channels[channel] : undefined;
		if (!channel || !entry) {
			return fail(400, { error: 'そのチャンネルは、まだ決まっていません。先に整えてください。' });
		}
		try {
			await discord.bot.postMessage(entry.id, 'Funmary からのテストです。');
			return { message: `#${channel} にテストのメッセージを送りました。` };
		} catch (error) {
			return fail(502, { error: describeError(error) });
		}
	},
};
