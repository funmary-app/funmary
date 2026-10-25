// Discord のサポートサーバーの招待リンク (#214)。Bot で発行したものと、管理者が自分で作って登録したものを持つ。
// 公開にした招待は、「リポジトリと作者」と Discord 連携の画面に出す。記録は DB の settings に置く
import { randomUUID } from 'node:crypto';

/** 招待の一覧を保存する設定の名前 */
export const SUPPORT_INVITES_KEY = 'support-invites';

/** 残す記録の数。古いものから捨てる */
const MAX_RECORDS = 50;
const MAX_NOTE_LENGTH = 100;
/** Discord の招待の期限の上限 (7 日) */
const MAX_DAYS = 7;
const MAX_USES = 100;
const DAY_S = 24 * 60 * 60;

export interface SupportInvite {
	readonly id: string;
	readonly code: string;
	/** bot は Bot で発行したもの (取り消すと Discord からも消す)。manual は管理者が自分で作って登録したもの */
	readonly source: 'bot' | 'manual';
	readonly public: boolean;
	/** 招待のチャンネル。manual では null */
	readonly channelId: string | null;
	/** 参加した人に Discord が付けるロール (名前は発行したときのもの) */
	readonly roles: readonly { readonly id: string; readonly name: string }[];
	readonly note: string | null;
	/** 0 は回数の制限なし */
	readonly maxUses: number;
	readonly createdAt: string;
	/** null は無期限 */
	readonly expiresAt: string | null;
	readonly revokedAt: string | null;
}

const CODE_PATTERN = /^[A-Za-z0-9-]{2,32}$/;
const INVITE_URL_PATTERN =
	/^https:\/\/(?:discord\.gg\/|(?:www\.)?discord(?:app)?\.com\/invite\/)([^/?#\s]+)\/?$/;

export const inviteUrl = (code: string) => `https://discord.gg/${code}`;

/** Discord の招待の URL からコードを取り出す。招待の URL でなければ null */
export function parseInviteUrl(input: string): string | null {
	const code = INVITE_URL_PATTERN.exec(input.trim())?.[1];
	return code && CODE_PATTERN.test(code) ? code : null;
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isNullableString = (value: unknown) => value === null || isString(value);

function isInvite(value: unknown): value is SupportInvite {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		isString(v['id']) &&
		isString(v['code']) &&
		CODE_PATTERN.test(v['code']) &&
		(v['source'] === 'bot' || v['source'] === 'manual') &&
		typeof v['public'] === 'boolean' &&
		isNullableString(v['channelId']) &&
		Array.isArray(v['roles']) &&
		v['roles'].every(
			(role: unknown) =>
				typeof role === 'object' &&
				role !== null &&
				isString((role as Record<string, unknown>)['id']) &&
				isString((role as Record<string, unknown>)['name']),
		) &&
		isNullableString(v['note']) &&
		typeof v['maxUses'] === 'number' &&
		isString(v['createdAt']) &&
		isNullableString(v['expiresAt']) &&
		isNullableString(v['revokedAt'])
	);
}

export function readInvites(value: unknown): SupportInvite[] {
	return Array.isArray(value) ? value.filter(isInvite) : [];
}

export const isActive = (invite: SupportInvite, now: Date) =>
	invite.revokedAt === null &&
	(invite.expiresAt === null || Date.parse(invite.expiresAt) > now.getTime());

export const activeInvites = (list: readonly SupportInvite[], now: Date) =>
	list.filter((invite) => isActive(invite, now));

/** 公開する招待 (使えるもののうち公開にした、いちばん新しいもの)。なければ null */
export function publicInvite(list: readonly SupportInvite[], now: Date): { url: string } | null {
	const latest = activeInvites(list, now)
		.filter((invite) => invite.public)
		.toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
	return latest ? { url: inviteUrl(latest.code) } : null;
}

export function addInvite(
	list: readonly SupportInvite[],
	input: Omit<SupportInvite, 'id' | 'createdAt' | 'revokedAt'>,
	now: Date,
): SupportInvite[] {
	const added: SupportInvite = {
		...input,
		id: randomUUID(),
		createdAt: now.toISOString(),
		revokedAt: null,
	};
	return [added, ...list].slice(0, MAX_RECORDS);
}

export const updateInvite = (
	list: readonly SupportInvite[],
	id: string,
	change: Partial<Pick<SupportInvite, 'public' | 'revokedAt'>>,
): SupportInvite[] => list.map((invite) => (invite.id === id ? { ...invite, ...change } : invite));

type FormResult<T> = { ok: true; value: T } | { ok: false; error: string };

const readNote = (form: FormData) => {
	const note = form.get('note');
	const trimmed = typeof note === 'string' ? note.trim() : '';
	return trimmed === '' ? null : trimmed;
};

const readInteger = (form: FormData, name: string) => {
	const value = form.get(name);
	return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : null;
};

export interface IssueInput {
	readonly channelId: string;
	readonly maxAgeSeconds: number;
	readonly maxUses: number;
	readonly roles: readonly { readonly id: string; readonly name: string }[];
	readonly public: boolean;
	readonly note: string | null;
}

/** Bot での発行のフォーム。チャンネルとロールは、Discord から読んだ一覧にあるものだけを受け付ける */
export function parseIssueForm(
	form: FormData,
	options: {
		readonly channels: readonly { readonly id: string; readonly name: string }[];
		readonly roles: readonly { readonly id: string; readonly name: string }[];
	},
): FormResult<IssueInput> {
	const channelId = form.get('channelId');
	if (typeof channelId !== 'string' || !options.channels.some((c) => c.id === channelId)) {
		return { ok: false, error: '招待するチャンネルを選んでください。' };
	}
	const days = readInteger(form, 'days');
	if (days === null || days > MAX_DAYS) {
		return { ok: false, error: `期限は 0 (無期限) から ${MAX_DAYS} 日で指定してください。` };
	}
	const maxUses = readInteger(form, 'maxUses');
	if (maxUses === null || maxUses > MAX_USES) {
		return {
			ok: false,
			error: `使える回数は 0 (制限なし) から ${MAX_USES} 回で指定してください。`,
		};
	}
	const roles = [];
	for (const id of form.getAll('roleIds')) {
		const role = options.roles.find((candidate) => candidate.id === id);
		if (!role) return { ok: false, error: '選んだロールが見つかりません。' };
		roles.push(role);
	}
	const note = readNote(form);
	if (note !== null && note.length > MAX_NOTE_LENGTH) {
		return { ok: false, error: `メモは ${MAX_NOTE_LENGTH} 文字までにしてください。` };
	}
	return {
		ok: true,
		value: {
			channelId,
			maxAgeSeconds: days * DAY_S,
			maxUses,
			roles,
			public: form.get('public') === 'on',
			note,
		},
	};
}

/** 自分で作った招待の登録のフォーム */
export function parseManualForm(
	form: FormData,
): FormResult<{ code: string; public: boolean; note: string | null }> {
	const url = form.get('url');
	const code = typeof url === 'string' ? parseInviteUrl(url) : null;
	if (!code) {
		return {
			ok: false,
			error: 'Discord の招待の URL (https://discord.gg/... の形) を入れてください。',
		};
	}
	const note = readNote(form);
	if (note !== null && note.length > MAX_NOTE_LENGTH) {
		return { ok: false, error: `メモは ${MAX_NOTE_LENGTH} 文字までにしてください。` };
	}
	return { ok: true, value: { code, public: form.get('public') === 'on', note } };
}
