// MCP の認可 (OAuth 2.1) の保存。クライアントの動的登録、認可コード、リフレッシュトークン。
// 発行するアクセストークンは、個人用のアクセストークンと同じ access_tokens に入れる。
// そのため /mcp と公開 API は、どちらの方法で作ったトークンも同じように受け付ける。
import { and, count, eq, inArray, isNotNull, isNull, lt, notExists, or } from 'drizzle-orm';
import type { AccessTokenScope, AccessTokenStore } from './access-token-store.ts';
import type { Database } from './database.ts';
import { accessTokens, oauthClients, oauthCodes, oauthRefreshTokens } from './schema.ts';
import { generateToken, hashToken } from './secrets.ts';

const REFRESH_PREFIX = 'fmr_';
const CODE_LIFETIME_MS = 10 * 60 * 1000;
/** アクセストークンの寿命。短くして、盗まれても長く使われないようにする */
export const OAUTH_ACCESS_TOKEN_LIFETIME_MS = 60 * 60 * 1000;
const REFRESH_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
/** 使われないまま残った登録を消すまでの日数 */
const UNUSED_CLIENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** 登録できるクライアントの数。誰でも登録できる口なので、DB が膨らまないよう上限を置く */
export const MAX_OAUTH_CLIENTS = 2000;

export interface OAuthClient {
	readonly id: string;
	readonly name: string;
	readonly redirectUris: readonly string[];
}

/** トークンエンドポイントが、認可コードの引き換え時に検証する項目 */
export interface ConsumedCode {
	readonly clientId: string;
	readonly userId: string;
	readonly redirectUri: string;
	readonly codeChallenge: string;
	readonly scopes: readonly AccessTokenScope[];
}

export interface IssuedTokens {
	readonly accessToken: string;
	readonly refreshToken: string;
	readonly expiresInSeconds: number;
	readonly scopes: readonly AccessTokenScope[];
}

export type RefreshResult =
	{ readonly kind: 'issued'; readonly tokens: IssuedTokens } | { readonly kind: 'invalid' };

export interface OAuthStore {
	/** クライアントを登録する。上限に達していたら null */
	registerClient(
		input: { readonly name: string; readonly redirectUris: readonly string[] },
		now: Date,
	): OAuthClient | null;
	findClient(clientId: string): OAuthClient | null;
	/** 同意された認可コードを作って返す (10 分で切れる、1 回だけ使える) */
	createCode(
		input: {
			readonly clientId: string;
			readonly userId: string;
			readonly redirectUri: string;
			readonly codeChallenge: string;
			readonly scopes: readonly AccessTokenScope[];
		},
		now: Date,
	): string;
	/** 認可コードを使い切る。知らない、期限切れ、使用済みなら null (使用済みは、もう存在しない) */
	consumeCode(code: string, now: Date): ConsumedCode | null;
	/** コードの引き換えに成功したときに、トークンを発行する */
	issueTokens(
		input: {
			readonly clientId: string;
			readonly userId: string;
			readonly scopes: readonly AccessTokenScope[];
		},
		now: Date,
	): IssuedTokens;
	/**
	 * リフレッシュトークンを新しいものに替える。
	 * すでに替えたトークンがまた来たら、盗まれたとみなして系列ごと無効にする。
	 * 設定の画面でアクセストークンを無効にしていた場合も、使えなくする。
	 */
	refresh(token: string, clientId: string, now: Date): RefreshResult;
}

export function createOAuthStore(
	database: Database,
	accessTokenStore: AccessTokenStore,
): OAuthStore {
	const { db, sqlite } = database;

	const issueInFamily = (
		input: { clientId: string; userId: string; scopes: readonly AccessTokenScope[] },
		familyId: string,
		now: Date,
	): IssuedTokens => {
		const client = db.select().from(oauthClients).where(eq(oauthClients.id, input.clientId)).get();
		const accessToken = accessTokenStore.issue(
			input.userId,
			{ name: `${client?.name ?? 'MCP クライアント'} (OAuth)`, scopes: input.scopes },
			new Date(now.getTime() + OAUTH_ACCESS_TOKEN_LIFETIME_MS),
			now,
		);
		const accessRow = db
			.select({ id: accessTokens.id })
			.from(accessTokens)
			.where(eq(accessTokens.tokenHash, hashToken(accessToken)))
			.get();
		const refreshToken = `${REFRESH_PREFIX}${generateToken()}`;
		db.insert(oauthRefreshTokens)
			.values({
				tokenHash: hashToken(refreshToken),
				familyId,
				clientId: input.clientId,
				userId: input.userId,
				scopes: [...input.scopes],
				accessTokenId: accessRow?.id ?? null,
				expiresAt: new Date(now.getTime() + REFRESH_LIFETIME_MS),
				createdAt: now,
			})
			.run();
		return {
			accessToken,
			refreshToken,
			expiresInSeconds: OAUTH_ACCESS_TOKEN_LIFETIME_MS / 1000,
			scopes: input.scopes,
		};
	};

	/** 系列のリフレッシュトークンと、それと一緒に発行したアクセストークンをすべて無効にする */
	const revokeFamily = (familyId: string, now: Date) => {
		const rows = db
			.select({ id: oauthRefreshTokens.id, accessTokenId: oauthRefreshTokens.accessTokenId })
			.from(oauthRefreshTokens)
			.where(eq(oauthRefreshTokens.familyId, familyId))
			.all();
		db.update(oauthRefreshTokens)
			.set({ revokedAt: now })
			.where(and(eq(oauthRefreshTokens.familyId, familyId), isNull(oauthRefreshTokens.revokedAt)))
			.run();
		const accessIds = rows.flatMap((row) =>
			row.accessTokenId === null ? [] : [row.accessTokenId],
		);
		if (accessIds.length > 0) {
			db.update(accessTokens)
				.set({ revokedAt: now })
				.where(and(inArray(accessTokens.id, accessIds), isNull(accessTokens.revokedAt)))
				.run();
		}
	};

	/** 登録を試みるたびに、古いものを片付ける */
	const purge = (now: Date) => {
		db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, now)).run();
		db.delete(oauthRefreshTokens)
			.where(or(lt(oauthRefreshTokens.expiresAt, now), isNotNull(oauthRefreshTokens.revokedAt)))
			.run();
		db.delete(oauthClients)
			.where(
				and(
					lt(oauthClients.createdAt, new Date(now.getTime() - UNUSED_CLIENT_RETENTION_MS)),
					notExists(
						db
							.select({ one: oauthRefreshTokens.id })
							.from(oauthRefreshTokens)
							.where(eq(oauthRefreshTokens.clientId, oauthClients.id)),
					),
				),
			)
			.run();
	};

	return {
		registerClient({ name, redirectUris }, now) {
			purge(now);
			const total = db.select({ n: count() }).from(oauthClients).get()?.n ?? 0;
			if (total >= MAX_OAUTH_CLIENTS) return null;
			const id = generateToken();
			db.insert(oauthClients)
				.values({ id, name, redirectUris: [...redirectUris], createdAt: now })
				.run();
			return { id, name, redirectUris };
		},
		findClient(clientId) {
			const row = db.select().from(oauthClients).where(eq(oauthClients.id, clientId)).get();
			return row ? { id: row.id, name: row.name, redirectUris: row.redirectUris } : null;
		},
		createCode(input, now) {
			const code = generateToken();
			db.insert(oauthCodes)
				.values({
					codeHash: hashToken(code),
					clientId: input.clientId,
					userId: input.userId,
					redirectUri: input.redirectUri,
					codeChallenge: input.codeChallenge,
					scopes: [...input.scopes],
					expiresAt: new Date(now.getTime() + CODE_LIFETIME_MS),
					createdAt: now,
				})
				.run();
			return code;
		},
		consumeCode(code, now) {
			// 読んで消すまでを 1 つの文にして、同じコードが 2 回通らないようにする
			const row = db
				.delete(oauthCodes)
				.where(eq(oauthCodes.codeHash, hashToken(code)))
				.returning()
				.get();
			if (!row || row.expiresAt.getTime() <= now.getTime()) return null;
			return {
				clientId: row.clientId,
				userId: row.userId,
				redirectUri: row.redirectUri,
				codeChallenge: row.codeChallenge,
				scopes: row.scopes as AccessTokenScope[],
			};
		},
		issueTokens(input, now) {
			return sqlite.transaction(() => issueInFamily(input, generateToken(), now))();
		},
		refresh(token, clientId, now) {
			return sqlite.transaction((): RefreshResult => {
				const row = db
					.select()
					.from(oauthRefreshTokens)
					.where(eq(oauthRefreshTokens.tokenHash, hashToken(token)))
					.get();
				if (!row || row.clientId !== clientId) return { kind: 'invalid' };
				if (row.usedAt !== null) {
					revokeFamily(row.familyId, now);
					return { kind: 'invalid' };
				}
				if (row.revokedAt !== null || row.expiresAt.getTime() <= now.getTime()) {
					return { kind: 'invalid' };
				}
				const access =
					row.accessTokenId === null
						? undefined
						: db.select().from(accessTokens).where(eq(accessTokens.id, row.accessTokenId)).get();
				// 設定の画面で、利用者がアクセストークンを無効にした。つなぎ直させる
				if (!access || access.revokedAt !== null) {
					revokeFamily(row.familyId, now);
					return { kind: 'invalid' };
				}
				db.update(oauthRefreshTokens)
					.set({ usedAt: now })
					.where(eq(oauthRefreshTokens.id, row.id))
					.run();
				db.update(accessTokens).set({ revokedAt: now }).where(eq(accessTokens.id, access.id)).run();
				return {
					kind: 'issued',
					tokens: issueInFamily(
						{
							clientId: row.clientId,
							userId: row.userId,
							scopes: row.scopes as AccessTokenScope[],
						},
						row.familyId,
						now,
					),
				};
			})();
		},
	};
}
