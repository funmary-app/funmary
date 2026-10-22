// 管理用の Discord のチャンネルとロールの配置。
// 足りないものだけを Bot が作り (何度実行しても同じ結果になる)、管理者が置き換えたものは作り直さない。
import { CHANNEL_TYPES, PERMISSIONS, type DiscordBot, type DiscordChannel } from './discord-bot.ts';

export const ADMIN_CHANNELS = [
	'deploy',
	'errors',
	'sources',
	'users',
	'subjects',
	'links',
	'other',
] as const;
export type AdminChannel = (typeof ADMIN_CHANNELS)[number];

/** 通知を鳴らすロール。ほかのチャンネルは、鳴らさない */
export const ADMIN_ROLES = ['deploy', 'errors', 'subjects'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

const CATEGORY_NAME = 'Funmary';
const roleName = (role: AdminRole) => `funmary-${role}`;
const channelName = (channel: AdminChannel) => channel;

/** managed は Bot が作ったか、同じ名前で見つけたもの。false は、管理者が置き換えたもの */
export interface LayoutEntry {
	readonly id: string;
	readonly managed: boolean;
}

export interface DiscordLayout {
	readonly category: LayoutEntry | null;
	readonly channels: Partial<Record<AdminChannel, LayoutEntry>>;
	readonly roles: Partial<Record<AdminRole, LayoutEntry>>;
}

export const EMPTY_LAYOUT: DiscordLayout = { category: null, channels: {}, roles: {} };

export interface EnsureReport {
	readonly layout: DiscordLayout;
	/** 表示用の、したことの一覧 */
	readonly actions: readonly string[];
}

/** 保存された値を読む。形が違うものは捨てる */
export function parseLayout(value: unknown): DiscordLayout {
	if (typeof value !== 'object' || value === null) return EMPTY_LAYOUT;
	const raw = value as { category?: unknown; channels?: unknown; roles?: unknown };
	const entry = (item: unknown): LayoutEntry | null => {
		if (typeof item !== 'object' || item === null) return null;
		const { id, managed } = item as { id?: unknown; managed?: unknown };
		return typeof id === 'string' && /^\d{1,25}$/.test(id) && typeof managed === 'boolean'
			? { id, managed }
			: null;
	};
	const pick = <K extends string>(keys: readonly K[], source: unknown) => {
		const result: Partial<Record<K, LayoutEntry>> = {};
		if (typeof source !== 'object' || source === null) return result;
		for (const key of keys) {
			const found = entry((source as Record<string, unknown>)[key]);
			if (found) result[key] = found;
		}
		return result;
	};
	return {
		category: entry(raw.category),
		channels: pick(ADMIN_CHANNELS, raw.channels),
		roles: pick(ADMIN_ROLES, raw.roles),
	};
}

/**
 * チャンネルとロールを整える。ID が DB にあって Discord にも存在するものは、そのまま使う。
 * 無ければ同じ名前のものを探して使い、それも無ければ作る。管理者が置き換えたもの (managed が false) には、手を付けない。
 */
export async function ensureLayout(bot: DiscordBot, current: DiscordLayout): Promise<EnsureReport> {
	const actions: string[] = [];
	const [channels, roles, botId] = await Promise.all([
		bot.listChannels(),
		bot.listRoles(),
		bot.me(),
	]);

	// ロール
	const nextRoles: Partial<Record<AdminRole, LayoutEntry>> = {};
	for (const role of ADMIN_ROLES) {
		const saved = current.roles[role];
		if (saved && (!saved.managed || roles.some((r) => r.id === saved.id))) {
			nextRoles[role] = saved;
			continue;
		}
		const found = roles.find((r) => r.name === roleName(role));
		if (found) {
			nextRoles[role] = { id: found.id, managed: true };
			actions.push(`ロール ${roleName(role)} を、既にあるものとして使います`);
			continue;
		}
		const created = await bot.createRole(roleName(role));
		nextRoles[role] = { id: created.id, managed: true };
		actions.push(`ロール ${roleName(role)} を作りました`);
	}

	// カテゴリ
	let category = current.category;
	const categoryExists = (id: string) =>
		channels.some((c) => c.id === id && c.type === CHANNEL_TYPES.category);
	if (!category || (category.managed && !categoryExists(category.id))) {
		const found = channels.find(
			(c) =>
				c.type === CHANNEL_TYPES.category && c.name.toLowerCase() === CATEGORY_NAME.toLowerCase(),
		);
		if (found) {
			category = { id: found.id, managed: true };
			actions.push(`カテゴリ ${CATEGORY_NAME} を、既にあるものとして使います`);
		} else {
			const created = await bot.createChannel({
				name: CATEGORY_NAME,
				kind: 'category',
				overwrites: hiddenFromEveryone(bot.guildId, botId, nextRoles),
			});
			category = { id: created.id, managed: true };
			actions.push(`カテゴリ ${CATEGORY_NAME} を作りました`);
		}
	}

	// チャンネル
	const nextChannels: Partial<Record<AdminChannel, LayoutEntry>> = {};
	for (const channel of ADMIN_CHANNELS) {
		const saved = current.channels[channel];
		if (saved && (!saved.managed || channels.some((c) => c.id === saved.id))) {
			nextChannels[channel] = saved;
			continue;
		}
		const found = channels.find(
			(c: DiscordChannel) =>
				c.type === CHANNEL_TYPES.text &&
				c.name === channelName(channel) &&
				c.parentId === category.id,
		);
		if (found) {
			nextChannels[channel] = { id: found.id, managed: true };
			actions.push(`チャンネル #${channelName(channel)} を、既にあるものとして使います`);
			continue;
		}
		const created = await bot.createChannel({
			name: channelName(channel),
			kind: 'text',
			parentId: category.id,
			overwrites: hiddenFromEveryone(bot.guildId, botId, nextRoles),
		});
		nextChannels[channel] = { id: created.id, managed: true };
		actions.push(`チャンネル #${channelName(channel)} を作りました`);
	}

	return { layout: { category, channels: nextChannels, roles: nextRoles }, actions };
}

/** @everyone には見せず、Bot 自身と、通知のロールにだけ見せる (ギルドの ID は @everyone のロールの ID と同じ) */
function hiddenFromEveryone(
	guildId: string,
	botId: string,
	roles: Partial<Record<AdminRole, LayoutEntry>>,
) {
	const view = PERMISSIONS.VIEW_CHANNEL;
	return [
		{ id: guildId, kind: 'role' as const, deny: view },
		{ id: botId, kind: 'member' as const, allow: view | PERMISSIONS.SEND_MESSAGES },
		...ADMIN_ROLES.flatMap((role) => {
			const entry = roles[role];
			return entry ? [{ id: entry.id, kind: 'role' as const, allow: view }] : [];
		}),
	];
}

export type ChannelCheck = { ok: true } | { ok: false; reason: string };

/** 管理者が置き換えようとしているチャンネルが、使えるかを確かめる */
export async function checkChannel(bot: DiscordBot, id: string): Promise<ChannelCheck> {
	const channel = await bot.getChannel(id);
	if (!channel) return { ok: false, reason: 'そのチャンネルが見つかりません (Bot から見えません)' };
	if (channel.guildId !== bot.guildId) {
		return { ok: false, reason: '指定したギルドのチャンネルではありません' };
	}
	if (channel.type !== CHANNEL_TYPES.text) {
		return { ok: false, reason: 'テキストのチャンネルではありません' };
	}
	return { ok: true };
}

/** 管理者が置き換えようとしているロールが、ギルドにあるかを確かめる */
export async function checkRole(bot: DiscordBot, id: string): Promise<ChannelCheck> {
	const roles = await bot.listRoles();
	return roles.some((role) => role.id === id)
		? { ok: true }
		: { ok: false, reason: '指定したギルドに、そのロールがありません' };
}
