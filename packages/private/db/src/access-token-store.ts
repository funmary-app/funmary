// 公開 API と MCP サーバー向けの個人用アクセストークン。feed-token-store.ts と違い、1 人が複数のトークンを同時に持てる。発行したときに 1 回だけ返し、DB には SHA-256 だけを保存する。
import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import type { Database } from './database.ts';
import { accessTokens, users } from './schema.ts';
import { generateToken, hashToken } from './secrets.ts';

/** GitHub の secret scanning などで、誤って公開されたトークンに気づきやすくする */
const TOKEN_PREFIX = 'fmy_';

/** 読み取りの範囲。同意画面で範囲が指定されなかったときの既定は、これだけ */
export const READ_SCOPES = [
	'read:lessons',
	'read:changes',
	'read:notifications',
	'read:transit',
] as const;
/** 書き込みの範囲。読み取りと分け、求められたときだけ付ける (誤って書き込めるトークンを渡さないため) */
export const WRITE_SCOPES = ['write:events', 'write:courses', 'write:notifications'] as const;
/** 発行できる範囲 */
export const ACCESS_TOKEN_SCOPES = [...READ_SCOPES, ...WRITE_SCOPES] as const;
export type AccessTokenScope = (typeof ACCESS_TOKEN_SCOPES)[number];

/** 使った日時を書き込む間隔。問い合わせのたびに書き込まないようにする */
const MARK_USED_INTERVAL_MS = 60 * 60 * 1000;

export interface AccessTokenOwner {
	readonly id: number;
	readonly userId: string;
	/** トークンの名前 (書き込みの履歴に残す) */
	readonly name: string;
	readonly scopes: readonly AccessTokenScope[];
	/** 持ち主が同意した利用規約とプライバシーポリシーの版。一度も同意していなければ null */
	readonly termsAcceptedVersion: string | null;
}

export interface AccessTokenSummary {
	readonly id: number;
	readonly name: string;
	readonly scopes: readonly AccessTokenScope[];
	readonly expiresAt: Date;
	readonly createdAt: Date;
	readonly lastUsedAt: Date | null;
}

export interface AccessTokenStore {
	/** 新しいトークンを発行して返す (先頭に fmy_ が付く)。同じ名前でも、何個でも発行できる */
	issue(
		userId: string,
		input: { readonly name: string; readonly scopes: readonly AccessTokenScope[] },
		expiresAt: Date,
		now: Date,
	): string;
	/** 有効なトークンの持ち主と範囲。期限切れ、取り消し済み、知らないトークン、停止した利用者なら null */
	findOwner(token: string, now: Date): AccessTokenOwner | null;
	/** 前に書き込んでから 1 時間以上たっていれば、使った日時を書き込む */
	markUsed(id: number, now: Date): void;
	/** 利用者が発行した、まだ有効なトークンの一覧 (新しい順) */
	list(userId: string, now: Date): readonly AccessTokenSummary[];
	/** 指定したトークンを無効にする。本人のものでなければ何もしない。無効にしたら true */
	revoke(userId: string, id: number, now: Date): boolean;
}

export function createAccessTokenStore(database: Database): AccessTokenStore {
	const { db } = database;

	return {
		issue(userId, { name, scopes }, expiresAt, now) {
			const token = `${TOKEN_PREFIX}${generateToken()}`;
			db.insert(accessTokens)
				.values({
					userId,
					name,
					scopes: [...scopes],
					tokenHash: hashToken(token),
					expiresAt,
					createdAt: now,
				})
				.run();
			return token;
		},
		findOwner(token, now) {
			const row = db
				.select({
					id: accessTokens.id,
					userId: accessTokens.userId,
					name: accessTokens.name,
					scopes: accessTokens.scopes,
					termsAcceptedVersion: users.termsAcceptedVersion,
				})
				.from(accessTokens)
				.innerJoin(users, eq(users.id, accessTokens.userId))
				.where(
					and(
						eq(accessTokens.tokenHash, hashToken(token)),
						isNull(accessTokens.revokedAt),
						gt(accessTokens.expiresAt, now),
						eq(users.status, 'active'),
					),
				)
				.get();
			return row ? { ...row, scopes: row.scopes as AccessTokenScope[] } : null;
		},
		markUsed(id, now) {
			const threshold = new Date(now.getTime() - MARK_USED_INTERVAL_MS);
			db.update(accessTokens)
				.set({ lastUsedAt: now })
				.where(
					and(
						eq(accessTokens.id, id),
						or(isNull(accessTokens.lastUsedAt), lt(accessTokens.lastUsedAt, threshold)),
					),
				)
				.run();
		},
		list(userId, now) {
			const rows = db
				.select({
					id: accessTokens.id,
					name: accessTokens.name,
					scopes: accessTokens.scopes,
					expiresAt: accessTokens.expiresAt,
					createdAt: accessTokens.createdAt,
					lastUsedAt: accessTokens.lastUsedAt,
				})
				.from(accessTokens)
				.where(
					and(
						eq(accessTokens.userId, userId),
						isNull(accessTokens.revokedAt),
						gt(accessTokens.expiresAt, now),
					),
				)
				.orderBy(accessTokens.createdAt)
				.all();
			return rows.map((row) => ({ ...row, scopes: row.scopes as AccessTokenScope[] })).reverse();
		},
		revoke(userId, id, now) {
			return (
				db
					.update(accessTokens)
					.set({ revokedAt: now })
					.where(
						and(
							eq(accessTokens.id, id),
							eq(accessTokens.userId, userId),
							isNull(accessTokens.revokedAt),
						),
					)
					.run().changes > 0
			);
		},
	};
}
