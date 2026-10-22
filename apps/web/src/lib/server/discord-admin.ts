// 管理画面の Discord の設定。チャンネルとロールを、Bot に任せるか、管理者が既存のものに置き換えるかを決める。
import {
	ADMIN_CHANNELS,
	ADMIN_ROLES,
	checkChannel,
	checkRole,
	DiscordApiError,
	type AdminChannel,
	type AdminRole,
	type DiscordBot,
	type DiscordLayout,
} from '@funmary/notify';

/** チャンネルとロールの配置を保存する設定の名前 */
export const DISCORD_LAYOUT_KEY = 'discord-layout';

/** Bot をオンライン表示にするかを保存する設定の名前。値は { enabled: boolean }。なければ、オン */
export const DISCORD_PRESENCE_KEY = 'discord-presence';

export function readPresenceEnabled(value: unknown): boolean {
	return !(
		typeof value === 'object' &&
		value !== null &&
		(value as { enabled?: unknown }).enabled === false
	);
}

/** 利用者の Discord 連携 (#163) を、管理者が有効にしたかを保存する設定の名前。値は { enabled: boolean }。なければ、無効 (新しい機能なので既定はオフ) */
export const DISCORD_LINKING_KEY = 'discord-linking';

export function readLinkingEnabled(value: unknown): boolean {
	return (
		typeof value === 'object' && value !== null && (value as { enabled?: unknown }).enabled === true
	);
}

const CHANNEL_LABELS: Record<AdminChannel, string> = {
	deploy: 'ビルドとデプロイの結果',
	errors: '予期しないエラー、取得元の不調',
	sources: '定期処理と取り込みの結果',
	users: '新規登録、招待、退会、権限の変更',
	subjects: '科目の登録 (シラバスにない授業)',
	links: '利用者ごとの非公開スレッド (Discord 連携)',
	other: 'そのほか',
};

const ROLE_LABELS: Record<AdminRole, string> = {
	deploy: 'デプロイの失敗を知らせる',
	errors: 'エラーを知らせる',
	subjects: '曜日と時限の確認待ちを知らせる',
};

export interface DiscordRow {
	readonly name: string;
	readonly label: string;
	readonly id: string | null;
	/** Bot が作ったか、同じ名前で見つけたもの。false は管理者が置き換えたもの */
	readonly managed: boolean;
}

export interface DiscordAdminView {
	readonly botConfigured: boolean;
	/** オンライン表示の状態。available は、いま動かせる環境か (本番で、送信を止めていないとき) */
	readonly presence: { readonly available: boolean; readonly enabled: boolean };
	readonly guildId: string | null;
	readonly channels: readonly DiscordRow[];
	readonly roles: readonly DiscordRow[];
}

export function toDiscordView(
	bot: DiscordBot | null,
	layout: DiscordLayout,
	presence: { available: boolean; enabled: boolean } = { available: false, enabled: true },
): DiscordAdminView {
	return {
		botConfigured: bot !== null,
		presence,
		guildId: bot?.guildId ?? null,
		channels: ADMIN_CHANNELS.map((name) => ({
			name,
			label: CHANNEL_LABELS[name],
			id: layout.channels[name]?.id ?? null,
			managed: layout.channels[name]?.managed ?? true,
		})),
		roles: ADMIN_ROLES.map((name) => ({
			name,
			label: ROLE_LABELS[name],
			id: layout.roles[name]?.id ?? null,
			managed: layout.roles[name]?.managed ?? true,
		})),
	};
}

export type ReplaceResult =
	| { readonly ok: true; readonly layout: DiscordLayout }
	| { readonly ok: false; readonly error: string };

const isChannelName = (value: string): value is AdminChannel =>
	(ADMIN_CHANNELS as readonly string[]).includes(value);
const isRoleName = (value: string): value is AdminRole =>
	(ADMIN_ROLES as readonly string[]).includes(value);

/** チャンネルかロールを、管理者が指定した ID に置き換える。使えるかを Discord で確かめてから */
export async function replaceEntry(
	bot: DiscordBot,
	layout: DiscordLayout,
	kind: 'channel' | 'role',
	name: string,
	id: string,
): Promise<ReplaceResult> {
	const trimmed = id.trim();
	if (!/^\d{5,25}$/.test(trimmed)) return { ok: false, error: 'ID は数字だけで入れてください。' };
	if (kind === 'channel') {
		if (!isChannelName(name)) return { ok: false, error: '知らないチャンネルです。' };
		const check = await checkChannel(bot, trimmed);
		if (!check.ok) return { ok: false, error: check.reason };
		return {
			ok: true,
			layout: {
				...layout,
				channels: { ...layout.channels, [name]: { id: trimmed, managed: false } },
			},
		};
	}
	if (!isRoleName(name)) return { ok: false, error: '知らないロールです。' };
	const check = await checkRole(bot, trimmed);
	if (!check.ok) return { ok: false, error: check.reason };
	return {
		ok: true,
		layout: { ...layout, roles: { ...layout.roles, [name]: { id: trimmed, managed: false } } },
	};
}

/** 置き換えを取り消して、Bot に任せる。次に整えるときに、同じ名前のものを探して使うか、作る */
export function useBot(
	layout: DiscordLayout,
	kind: 'channel' | 'role',
	name: string,
): DiscordLayout {
	if (kind === 'channel') {
		return {
			...layout,
			channels: Object.fromEntries(Object.entries(layout.channels).filter(([key]) => key !== name)),
		};
	}
	return {
		...layout,
		roles: Object.fromEntries(Object.entries(layout.roles).filter(([key]) => key !== name)),
	};
}

export type RoleChangeResult =
	{ readonly ok: true; readonly message: string } | { readonly ok: false; readonly error: string };

/** Discord のユーザーに、Funmary のロールを付ける、または外す。ユーザーの ID は Discord の「ユーザー ID をコピー」で得る */
export async function changeMemberRole(
	bot: DiscordBot,
	layout: DiscordLayout,
	action: 'add' | 'remove',
	roleName: string,
	userId: string,
): Promise<RoleChangeResult> {
	const id = userId.trim();
	if (!/^\d{5,25}$/.test(id)) {
		return { ok: false, error: 'ユーザーの ID は、数字だけで入れてください。' };
	}
	if (!isRoleName(roleName)) return { ok: false, error: '知らないロールです。' };
	const role = layout.roles[roleName];
	if (!role) {
		return {
			ok: false,
			error:
				'そのロールは、まだ決まっていません。先に「チャンネルとロールを整える」を押してください。',
		};
	}
	try {
		if (action === 'add') await bot.addMemberRole(id, role.id);
		else await bot.removeMemberRole(id, role.id);
	} catch (error) {
		if (error instanceof DiscordApiError) {
			if (error.status === 404) {
				return {
					ok: false,
					error:
						'そのユーザーは、サーバーにいません (ID が違うか、まだ参加していません)。サーバーに参加してもらってから、もう一度お試しください。',
				};
			}
			if (error.status === 403) {
				return {
					ok: false,
					error:
						'ロールを付ける権限がありません。サーバーの設定の「ロール」で、Bot のロールを funmary- で始まるロールより上に置いてください。',
				};
			}
			return { ok: false, error: error.message };
		}
		return {
			ok: false,
			error: 'Discord に接続できませんでした。時間をおいて、もう一度お試しください。',
		};
	}
	const label = `funmary-${roleName}`;
	return {
		ok: true,
		message:
			action === 'add'
				? `ユーザー ${id} に、ロール ${label} を付けました。`
				: `ユーザー ${id} から、ロール ${label} を外しました。`,
	};
}
