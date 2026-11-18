import { createHash } from 'node:crypto';
import {
	createAccessTokenStore,
	createAuthStore,
	createOAuthStore,
	type Database,
} from '@funmary/db';
import { describe, expect, it } from 'vitest';
import { buildRedirect, parseAuthorizeRequest } from './oauth-authorize.ts';
import { createOAuthRoutes, isAllowedRedirectUri, verifyPkce } from './oauth-routes.ts';
import { useTestDatabase } from '@funmary/db/testing';

let database: Database;
useTestDatabase('funmary-oauth-routes-', (db) => (database = db));

const ORIGIN = 'https://funmary.example.com';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'a'.repeat(43);
const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

function setup() {
	const accessTokens = createAccessTokenStore(database);
	const oauth = createOAuthStore(database, accessTokens);
	const auth = createAuthStore(database);
	const userId = auth.createUser(
		{ googleSub: 'a', email: 'a@fun.ac.jp', name: null, role: 'user' },
		new Date(),
	);
	const app = createOAuthRoutes({ oauth, origin: ORIGIN });
	return { app, oauth, accessTokens, userId };
}

const post = (app: ReturnType<typeof setup>['app'], path: string, body: Record<string, string>) =>
	app.request(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(body),
	});

const register = (app: ReturnType<typeof setup>['app'], body: unknown) =>
	app.request('/oauth/register', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});

describe('発見用の情報', () => {
	it('保護されたリソースの情報が、/mcp の下の形でも返る', async () => {
		const { app } = setup();

		for (const path of [
			'/.well-known/oauth-protected-resource',
			'/.well-known/oauth-protected-resource/mcp',
		]) {
			const res = await app.request(path);
			expect(res.status).toBe(200);
			expect(await res.json()).toMatchObject({
				resource: `${ORIGIN}/mcp`,
				authorization_servers: [ORIGIN],
			});
		}
	});

	it('認可サーバーの情報に、PKCE の S256 と公開クライアントだけを載せる', async () => {
		const { app } = setup();

		const res = await app.request('/.well-known/oauth-authorization-server');

		expect(await res.json()).toMatchObject({
			issuer: ORIGIN,
			authorization_endpoint: `${ORIGIN}/oauth/authorize`,
			token_endpoint: `${ORIGIN}/oauth/token`,
			registration_endpoint: `${ORIGIN}/oauth/register`,
			code_challenge_methods_supported: ['S256'],
			token_endpoint_auth_methods_supported: ['none'],
		});
	});
});

describe('クライアントの登録', () => {
	it('登録すると 201 で client_id が返り、DB で引ける', async () => {
		const { app, oauth } = setup();

		const res = await register(app, { client_name: 'Claude', redirect_uris: [REDIRECT] });

		expect(res.status).toBe(201);
		const body = (await res.json()) as { client_id: string };
		expect(body).toMatchObject({
			client_name: 'Claude',
			redirect_uris: [REDIRECT],
			token_endpoint_auth_method: 'none',
		});
		expect(oauth.findClient(body.client_id)?.name).toBe('Claude');
	});

	it.each([
		['リダイレクト先がない', { client_name: 'x' }],
		['空の配列', { redirect_uris: [] }],
		['http の外部ホスト', { redirect_uris: ['http://example.com/cb'] }],
		['独自のスキーム', { redirect_uris: ['myapp://cb'] }],
		['URL の断片つき', { redirect_uris: ['https://example.com/cb#x'] }],
		['文字列でない', { redirect_uris: [1] }],
		['6 個', { redirect_uris: Array.from({ length: 6 }, (_, i) => `https://e.com/${i}`) }],
	])('登録できない: %s', async (_name, body) => {
		const { app } = setup();

		const res = await register(app, body);

		expect(res.status).toBe(400);
		expect(await res.json()).toMatchObject({ error: 'invalid_redirect_uri' });
	});

	it('JSON でない本文は 400', async () => {
		const { app } = setup();

		const res = await app.request('/oauth/register', { method: 'POST', body: 'x' });

		expect(res.status).toBe(400);
	});

	it('名前がなければ既定の名前になり、長い名前は切る', async () => {
		const { app } = setup();

		const plain = await register(app, { redirect_uris: [REDIRECT] });
		const long = await register(app, { client_name: 'あ'.repeat(300), redirect_uris: [REDIRECT] });

		expect(await plain.json()).toMatchObject({ client_name: 'MCP クライアント' });
		const body = (await long.json()) as { client_name: string };
		expect(body.client_name).toHaveLength(100);
	});

	it('ループバックの http は登録できる', () => {
		expect(isAllowedRedirectUri('http://localhost:33418/callback')).toBe(true);
		expect(isAllowedRedirectUri('http://127.0.0.1:8080/cb')).toBe(true);
		expect(isAllowedRedirectUri('https://user:pass@example.com/cb')).toBe(false);
	});
});

describe('PKCE', () => {
	it('code_verifier の SHA-256 が code_challenge と一致するときだけ通る', () => {
		expect(verifyPkce(VERIFIER, challengeOf(VERIFIER))).toBe(true);
		expect(verifyPkce('b'.repeat(43), challengeOf(VERIFIER))).toBe(false);
		expect(verifyPkce('short', challengeOf('short'))).toBe(false);
	});
});

async function authorize(s: ReturnType<typeof setup>) {
	const res = await register(s.app, { client_name: 'Claude', redirect_uris: [REDIRECT] });
	const { client_id: clientId } = (await res.json()) as { client_id: string };
	const code = s.oauth.createCode(
		{
			clientId,
			userId: s.userId,
			redirectUri: REDIRECT,
			codeChallenge: challengeOf(VERIFIER),
			scopes: ['read:lessons'],
		},
		new Date(),
	);
	return { clientId, code };
}

describe('トークンの発行', () => {
	it('認可コードを引き換えると、使えるアクセストークンが返る', async () => {
		const s = setup();
		const { clientId, code } = await authorize(s);

		const res = await post(s.app, '/oauth/token', {
			grant_type: 'authorization_code',
			client_id: clientId,
			code,
			redirect_uri: REDIRECT,
			code_verifier: VERIFIER,
		});

		expect(res.status).toBe(200);
		expect(res.headers.get('Cache-Control')).toBe('no-store');
		const body = (await res.json()) as {
			access_token: string;
			refresh_token: string;
			token_type: string;
			expires_in: number;
			scope: string;
		};
		expect(body).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'read:lessons' });
		expect(s.accessTokens.findOwner(body.access_token, new Date())).toMatchObject({
			userId: s.userId,
			scopes: ['read:lessons'],
		});
	});

	it('同じコードは 2 回使えない', async () => {
		const s = setup();
		const { clientId, code } = await authorize(s);
		const params = {
			grant_type: 'authorization_code',
			client_id: clientId,
			code,
			redirect_uri: REDIRECT,
			code_verifier: VERIFIER,
		};
		await post(s.app, '/oauth/token', params);

		const again = await post(s.app, '/oauth/token', params);

		expect(again.status).toBe(400);
		expect(await again.json()).toMatchObject({ error: 'invalid_grant' });
	});

	it.each([
		['code_verifier が違う', { code_verifier: 'z'.repeat(43) }],
		['redirect_uri が違う', { redirect_uri: 'https://claude.ai/other' }],
		['code_verifier がない', { code_verifier: '' }],
	])('引き換えできない: %s。コードも使い切る', async (_name, override) => {
		const s = setup();
		const { clientId, code } = await authorize(s);
		const params = {
			grant_type: 'authorization_code',
			client_id: clientId,
			code,
			redirect_uri: REDIRECT,
			code_verifier: VERIFIER,
		};

		const bad = await post(s.app, '/oauth/token', { ...params, ...override });
		const retry = await post(s.app, '/oauth/token', params);

		expect(bad.status).toBe(400);
		expect(await bad.json()).toMatchObject({ error: 'invalid_grant' });
		expect(retry.status).toBe(400);
	});

	it('別のクライアントのコードは引き換えられない', async () => {
		const s = setup();
		const { code } = await authorize(s);
		const other = (await (
			await register(s.app, { redirect_uris: ['https://other.example/cb'] })
		).json()) as { client_id: string };

		const res = await post(s.app, '/oauth/token', {
			grant_type: 'authorization_code',
			client_id: other.client_id,
			code,
			redirect_uri: REDIRECT,
			code_verifier: VERIFIER,
		});

		expect(res.status).toBe(400);
	});

	it('知らない client_id は 401', async () => {
		const { app } = setup();

		const res = await post(app, '/oauth/token', {
			grant_type: 'authorization_code',
			client_id: 'x',
		});

		expect(res.status).toBe(401);
		expect(await res.json()).toMatchObject({ error: 'invalid_client' });
	});

	it('未対応の grant_type は unsupported_grant_type', async () => {
		const s = setup();
		const { clientId } = await authorize(s);

		const res = await post(s.app, '/oauth/token', { grant_type: 'password', client_id: clientId });

		expect(await res.json()).toMatchObject({ error: 'unsupported_grant_type' });
	});

	it('リフレッシュトークンで、新しいトークンに替わる', async () => {
		const s = setup();
		const { clientId, code } = await authorize(s);
		const first = (await (
			await post(s.app, '/oauth/token', {
				grant_type: 'authorization_code',
				client_id: clientId,
				code,
				redirect_uri: REDIRECT,
				code_verifier: VERIFIER,
			})
		).json()) as { refresh_token: string; access_token: string };

		const res = await post(s.app, '/oauth/token', {
			grant_type: 'refresh_token',
			client_id: clientId,
			refresh_token: first.refresh_token,
		});

		expect(res.status).toBe(200);
		const next = (await res.json()) as { refresh_token: string; access_token: string };
		expect(next.refresh_token).not.toBe(first.refresh_token);
		expect(s.accessTokens.findOwner(next.access_token, new Date())).not.toBeNull();
		expect(s.accessTokens.findOwner(first.access_token, new Date())).toBeNull();

		const reuse = await post(s.app, '/oauth/token', {
			grant_type: 'refresh_token',
			client_id: clientId,
			refresh_token: first.refresh_token,
		});
		expect(reuse.status).toBe(400);
		expect(s.accessTokens.findOwner(next.access_token, new Date())).toBeNull();
	});
});

describe('同意画面への依頼の検査', () => {
	const setupClient = () => {
		const { oauth } = setup();
		const client = oauth.registerClient({ name: 'Claude', redirectUris: [REDIRECT] }, new Date());
		if (!client) throw new Error('登録できませんでした');
		return { oauth, client };
	};
	const query = (client: { id: string }, override: Record<string, string> = {}) =>
		new URLSearchParams({
			client_id: client.id,
			redirect_uri: REDIRECT,
			response_type: 'code',
			code_challenge: challengeOf(VERIFIER),
			code_challenge_method: 'S256',
			state: 'xyz',
			...override,
		});

	it('正しい依頼は通り、scope がなければ、読み取りの範囲だけを求めたことになる (書き込みは、求められたときだけ)', () => {
		const { oauth, client } = setupClient();

		const result = parseAuthorizeRequest(query(client), (id) => oauth.findClient(id));

		expect(result).toMatchObject({
			kind: 'ok',
			request: {
				redirectUri: REDIRECT,
				state: 'xyz',
				requestedScopes: ['read:lessons', 'read:changes', 'read:notifications', 'read:transit'],
			},
		});
	});

	it('scope を指定したら、知っている範囲だけに絞る', () => {
		const { oauth, client } = setupClient();

		const result = parseAuthorizeRequest(
			query(client, { scope: 'read:changes admin:everything' }),
			(id) => oauth.findClient(id),
		);

		expect(result).toMatchObject({ kind: 'ok', request: { requestedScopes: ['read:changes'] } });
	});

	it('書き込みの範囲は、scope に書かれたときだけ求める', () => {
		const { oauth, client } = setupClient();

		const result = parseAuthorizeRequest(
			query(client, { scope: 'read:lessons write:events write:notifications' }),
			(id) => oauth.findClient(id),
		);

		expect(result).toMatchObject({
			kind: 'ok',
			request: { requestedScopes: ['read:lessons', 'write:events', 'write:notifications'] },
		});
	});

	it('知らない client_id と、登録にない redirect_uri は、どこへも戻さない', () => {
		const { oauth, client } = setupClient();

		expect(
			parseAuthorizeRequest(query({ id: 'unknown' }), (id) => oauth.findClient(id)),
		).toMatchObject({
			kind: 'fatal',
		});
		expect(
			parseAuthorizeRequest(query(client, { redirect_uri: 'https://evil.example/cb' }), (id) =>
				oauth.findClient(id),
			),
		).toMatchObject({ kind: 'fatal' });
	});

	it('PKCE がない、S256 でない、response_type が code でないときは、登録済みの戻り先へ error を返す', () => {
		const { oauth, client } = setupClient();

		expect(
			parseAuthorizeRequest(query(client, { code_challenge: '' }), (id) => oauth.findClient(id)),
		).toMatchObject({ kind: 'redirect-error', error: 'invalid_request', state: 'xyz' });
		expect(
			parseAuthorizeRequest(query(client, { code_challenge_method: 'plain' }), (id) =>
				oauth.findClient(id),
			),
		).toMatchObject({ kind: 'redirect-error', error: 'invalid_request' });
		expect(
			parseAuthorizeRequest(query(client, { response_type: 'token' }), (id) =>
				oauth.findClient(id),
			),
		).toMatchObject({ kind: 'redirect-error', error: 'unsupported_response_type' });
	});

	it('戻り先の URL に code と state を付ける。もとのクエリは残す', () => {
		expect(buildRedirect('https://claude.ai/cb?x=1', { code: 'abc' }, 'xyz')).toBe(
			'https://claude.ai/cb?x=1&code=abc&state=xyz',
		);
		expect(buildRedirect(REDIRECT, { error: 'access_denied' }, null)).toBe(
			`${REDIRECT}?error=access_denied`,
		);
	});
});
