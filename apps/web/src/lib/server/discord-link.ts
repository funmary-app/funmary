// 利用者の Discord 連携 (#163)。OAuth の途中経過 (state) の封印と、認可コードを受け取ったあとの、ギルドへの参加、スレッドか DM の用意、紐付けの保存をまとめる。
import type { DiscordBot, DiscordOAuthClient } from '@funmary/notify';
import {
	DEFAULT_CHANNEL_KINDS,
	type DiscordLinkKindSettings,
	type DiscordLinkStore,
	type SecretBox,
} from '@funmary/db';
import type { Logger } from '@funmary/log';

/** state を有効とみなす時間。長く連携の画面を放っておいたら、やり直してもらう */
const STATE_TTL_MS = 10 * 60 * 1000;

/** 連携するときの、最初の 1 つだけの送り先。種類ごとの振り分け (both を含む) は、連携したあとに設定する */
export type InitialDestination = 'thread' | 'dm';

export interface DiscordLinkState {
	readonly userId: string;
	readonly destination: InitialDestination;
	readonly startedAt: number;
}

/** state を Discord に渡せる文字列にする (SecretBox で暗号化するので、書き換えられても開けない) */
export function sealLinkState(box: SecretBox, state: DiscordLinkState): string {
	return box.encrypt(JSON.stringify(state));
}

/** state を元に戻す。壊れている、書き換えられている、期限切れなら null */
export function openLinkState(box: SecretBox, sealed: string, now: Date): DiscordLinkState | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(box.decrypt(sealed));
	} catch {
		return null;
	}
	if (typeof parsed !== 'object' || parsed === null) return null;
	const { userId, destination, startedAt } = parsed as Record<string, unknown>;
	if (
		typeof userId !== 'string' ||
		(destination !== 'thread' && destination !== 'dm') ||
		typeof startedAt !== 'number'
	) {
		return null;
	}
	if (now.getTime() - startedAt > STATE_TTL_MS) return null;
	return { userId, destination, startedAt };
}

export type CompleteLinkResult =
	| { readonly ok: true; readonly message: string }
	| { readonly ok: false; readonly message: string };

export interface CompleteLinkDeps {
	readonly oauth: DiscordOAuthClient;
	readonly bot: DiscordBot | null;
	readonly store: DiscordLinkStore;
	/** 利用者ごとの非公開スレッドの親チャンネル の ID。管理者が「チャンネルとロールを整える」を実行していなければ null */
	readonly linksChannelId: string | null;
	/** 参加した利用者に付けるロール。管理者が選んでいなければ空配列 */
	readonly joinRoleIds: readonly string[];
	readonly log: Pick<Logger, 'warn'>;
}

/** エラーの中身を、秘密の値を含まない文字列にする (トークンはエラーの本文に出さない設計、discord-oauth.ts) */
const describe = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const TRY_AGAIN = 'もう一度お試しください。';

/** スレッドか DM を用意して、最初の案内を送る。失敗したら null (呼び出し側でエラーを出す) */
export async function prepareChannel(
	bot: DiscordBot,
	destination: InitialDestination,
	linksChannelId: string | null,
	discordUserId: string,
): Promise<{ channelId: string } | { error: string }> {
	if (destination === 'thread') {
		if (!linksChannelId) {
			return { error: 'サーバーの準備がまだです。管理者に伝えてください。' };
		}
		const threadId = await bot.createPrivateThread(linksChannelId, `link-${discordUserId}`);
		await bot.addThreadMember(threadId, discordUserId);
		await bot.postMessage(threadId, 'Funmary と連携しました。ここに通知が届きます。');
		return { channelId: threadId };
	}
	const dmChannelId = await bot.createDm(discordUserId);
	await bot.postMessage(dmChannelId, 'Funmary と連携しました。ここに通知が届きます。');
	return { channelId: dmChannelId };
}

/**
 * 種類ごとの送り先の設定で、その送り先 (thread か dm) のチャンネルがまだ無ければ用意する。
 * もう有れば、そのまま返す (#163)
 */
export async function ensureChannel(
	bot: DiscordBot,
	linksChannelId: string | null,
	discordUserId: string,
	destination: InitialDestination,
	existing: { readonly threadChannelId: string | null; readonly dmChannelId: string | null },
): Promise<{ channelId: string } | { error: string }> {
	const have = destination === 'thread' ? existing.threadChannelId : existing.dmChannelId;
	if (have) return { channelId: have };
	return prepareChannel(bot, destination, linksChannelId, discordUserId);
}

/** 認可コードを受け取ったあとの処理。成功したら紐付けを保存する */
export async function completeDiscordLink(
	deps: CompleteLinkDeps,
	input: { code: string; state: DiscordLinkState },
	now: Date,
): Promise<CompleteLinkResult> {
	if (!deps.bot) {
		return { ok: false, message: 'Bot が設定されていないので、連携できません。' };
	}
	let tokens;
	let discordUser;
	try {
		tokens = await deps.oauth.exchangeCode(input.code);
		discordUser = await deps.oauth.fetchCurrentUser(tokens.accessToken);
	} catch (error) {
		deps.log.warn(`Discord 連携のトークンの取得に失敗しました: ${describe(error)}`);
		return { ok: false, message: `Discord との通信に失敗しました。${TRY_AGAIN}` };
	}

	if (deps.store.isDiscordUserLinkedToOther(discordUser.id, input.state.userId)) {
		return { ok: false, message: 'その Discord アカウントは、すでに別の利用者に紐付いています。' };
	}

	try {
		await deps.bot.addGuildMember(discordUser.id, tokens.accessToken, deps.joinRoleIds);
	} catch (error) {
		deps.log.warn(`Discord 連携のサーバーへの参加に失敗しました: ${describe(error)}`);
		return {
			ok: false,
			message: `サーバーへの参加を許可しなかったか、失敗しました。${TRY_AGAIN}`,
		};
	}

	let channel: { channelId: string } | { error: string };
	try {
		channel = await prepareChannel(
			deps.bot,
			input.state.destination,
			deps.linksChannelId,
			discordUser.id,
		);
	} catch (error) {
		deps.log.warn(`Discord 連携の送り先の用意に失敗しました: ${describe(error)}`);
		channel = {
			error:
				input.state.destination === 'dm'
					? `DM を開けませんでした。サーバーのメンバーからの DM を許可しているか確かめてください。${TRY_AGAIN}`
					: `スレッドの用意に失敗しました。${TRY_AGAIN}`,
		};
	}
	if ('error' in channel) return { ok: false, message: channel.error };

	// 届ける種類ごとの設定は、まず選んだ送り先にそろえる (まとめて設定、#163)。あとで種類ごとに変えられる
	const kindSettings: DiscordLinkKindSettings = Object.fromEntries(
		DEFAULT_CHANNEL_KINDS.map((kind) => [
			kind,
			{ destination: input.state.destination, mention: false },
		]),
	);
	deps.store.save(
		input.state.userId,
		{
			discordUserId: discordUser.id,
			accessToken: tokens.accessToken,
			refreshToken: tokens.refreshToken,
			tokenExpiresAt: tokens.expiresAt,
			threadChannelId: input.state.destination === 'thread' ? channel.channelId : null,
			dmChannelId: input.state.destination === 'dm' ? channel.channelId : null,
			kindSettings,
		},
		now,
	);
	return { ok: true, message: 'Discord と連携しました。' };
}
