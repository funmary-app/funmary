// MCP の認可 (OAuth 2.1) の口のうち、画面を持たないもの: 発見用の情報、クライアントの動的登録、トークンの発行。
// 同意画面 (/oauth/authorize) は、ログインの Cookie を使うので、SvelteKit 側にある。
// claude.ai などのコネクタは、この流れでしか認証できない。個人用のアクセストークンは、そのまま使える。
import { createHash, timingSafeEqual } from 'node:crypto';
import { ACCESS_TOKEN_SCOPES, type OAuthStore } from '@funmary/db';
import { Hono, type Context } from 'hono';
import { rateLimiter } from 'hono-rate-limiter';

export interface OAuthRoutesDeps {
	readonly oauth: Pick<
		OAuthStore,
		'registerClient' | 'findClient' | 'consumeCode' | 'issueTokens' | 'refresh'
	>;
	/** https://example.com のような、公開するオリジン。認可サーバーの識別子 (issuer) にもなる */
	readonly origin: string;
	readonly now?: () => Date;
}

const MAX_REDIRECT_URIS = 5;
const MAX_URI_LENGTH = 2000;
const MAX_NAME_LENGTH = 100;
const DEFAULT_CLIENT_NAME = 'MCP クライアント';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
/** RFC 7636 の code_verifier: 43 から 128 文字の、予約されていない文字 */
const CODE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;

/** リダイレクト先として登録してよい URI か。https か、ループバックの http だけ。URL の断片と認証情報は付けられない */
export function isAllowedRedirectUri(value: string): boolean {
	if (value.length > MAX_URI_LENGTH) return false;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	if (url.hash !== '' || url.username !== '' || url.password !== '') return false;
	if (url.protocol === 'https:') return true;
	return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
}

/** PKCE (S256) の検証。code_verifier の SHA-256 を Base64URL にしたものが、code_challenge と等しいか */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
	if (!CODE_VERIFIER.test(codeVerifier)) return false;
	const expected = Buffer.from(createHash('sha256').update(codeVerifier).digest('base64url'));
	const actual = Buffer.from(codeChallenge);
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const noStore = (c: Context) => {
	c.header('Cache-Control', 'no-store');
	c.header('Pragma', 'no-cache');
};

const tokenError = (c: Context, error: string, description: string, status: 400 | 401 = 400) => {
	noStore(c);
	return c.json({ error, error_description: description }, status);
};

export function createOAuthRoutes(deps: OAuthRoutesDeps): Hono {
	const app = new Hono();
	const now = deps.now ?? (() => new Date());
	const origin = deps.origin.replace(/\/$/, '');
	const resource = `${origin}/mcp`;

	// 外から誰でも呼べる口なので、全体で回数を絞る (ログインのような個人を特定する鍵がない)
	const globalLimit = (limit: number) =>
		rateLimiter({
			windowMs: 60 * 1000,
			limit,
			standardHeaders: 'draft-7',
			keyGenerator: () => 'global',
			handler: (c) => {
				noStore(c);
				return c.json(
					{
						error: 'temporarily_unavailable',
						error_description: '回数が多すぎます。少し待ってください',
					},
					429,
				);
			},
		});

	const protectedResource = (c: Context) =>
		c.json({
			resource,
			authorization_servers: [origin],
			scopes_supported: [...ACCESS_TOKEN_SCOPES],
			bearer_methods_supported: ['header'],
		});
	app.get('/.well-known/oauth-protected-resource', protectedResource);
	app.get('/.well-known/oauth-protected-resource/mcp', protectedResource);

	app.get('/.well-known/oauth-authorization-server', (c) =>
		c.json({
			issuer: origin,
			authorization_endpoint: `${origin}/oauth/authorize`,
			token_endpoint: `${origin}/oauth/token`,
			registration_endpoint: `${origin}/oauth/register`,
			scopes_supported: [...ACCESS_TOKEN_SCOPES],
			response_types_supported: ['code'],
			grant_types_supported: ['authorization_code', 'refresh_token'],
			code_challenge_methods_supported: ['S256'],
			token_endpoint_auth_methods_supported: ['none'],
		}),
	);

	app.post('/oauth/register', globalLimit(30), async (c) => {
		noStore(c);
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json(
				{ error: 'invalid_client_metadata', error_description: 'JSON ではありません' },
				400,
			);
		}
		const input =
			typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
		const redirectUris = input['redirect_uris'];
		if (
			!Array.isArray(redirectUris) ||
			redirectUris.length === 0 ||
			redirectUris.length > MAX_REDIRECT_URIS ||
			!redirectUris.every(
				(uri): uri is string => typeof uri === 'string' && isAllowedRedirectUri(uri),
			)
		) {
			return c.json(
				{
					error: 'invalid_redirect_uri',
					error_description:
						'redirect_uris には、https か、localhost などの http の URI を 1 個から 5 個、指定してください',
				},
				400,
			);
		}
		const rawName = input['client_name'];
		const name =
			typeof rawName === 'string' && rawName.trim() !== ''
				? rawName.trim().slice(0, MAX_NAME_LENGTH)
				: DEFAULT_CLIENT_NAME;
		const issuedAt = now();
		const client = deps.oauth.registerClient({ name, redirectUris }, issuedAt);
		if (!client) {
			return c.json(
				{ error: 'temporarily_unavailable', error_description: '登録できるクライアントの上限です' },
				503,
			);
		}
		return c.json(
			{
				client_id: client.id,
				client_id_issued_at: Math.floor(issuedAt.getTime() / 1000),
				client_name: client.name,
				redirect_uris: client.redirectUris,
				grant_types: ['authorization_code', 'refresh_token'],
				response_types: ['code'],
				token_endpoint_auth_method: 'none',
			},
			201,
		);
	});

	app.post('/oauth/token', globalLimit(120), async (c) => {
		const form: Record<string, unknown> = await c.req.parseBody().catch(() => ({}));
		const field = (name: string) => {
			const value = form[name];
			return typeof value === 'string' ? value : '';
		};
		const clientId = field('client_id');
		const client = clientId ? deps.oauth.findClient(clientId) : null;
		if (!client) return tokenError(c, 'invalid_client', 'client_id が正しくありません', 401);

		const respond = (tokens: {
			accessToken: string;
			refreshToken: string;
			expiresInSeconds: number;
			scopes: readonly string[];
		}) => {
			noStore(c);
			return c.json({
				access_token: tokens.accessToken,
				token_type: 'Bearer',
				expires_in: tokens.expiresInSeconds,
				refresh_token: tokens.refreshToken,
				scope: tokens.scopes.join(' '),
			});
		};

		const grantType = field('grant_type');
		if (grantType === 'authorization_code') {
			const code = field('code');
			const consumed = code ? deps.oauth.consumeCode(code, now()) : null;
			// コードは、検査に落ちても使い切る (consumeCode が消す)。同じコードで何度も試せないようにする
			if (
				!consumed ||
				consumed.clientId !== client.id ||
				consumed.redirectUri !== field('redirect_uri') ||
				!verifyPkce(field('code_verifier'), consumed.codeChallenge)
			) {
				return tokenError(c, 'invalid_grant', '認可コードが正しくありません');
			}
			return respond(
				deps.oauth.issueTokens(
					{ clientId: client.id, userId: consumed.userId, scopes: consumed.scopes },
					now(),
				),
			);
		}
		if (grantType === 'refresh_token') {
			const result = deps.oauth.refresh(field('refresh_token'), client.id, now());
			if (result.kind !== 'issued') {
				return tokenError(c, 'invalid_grant', 'リフレッシュトークンが正しくありません');
			}
			return respond(result.tokens);
		}
		return tokenError(
			c,
			'unsupported_grant_type',
			'authorization_code か refresh_token を指定してください',
		);
	});

	return app;
}
