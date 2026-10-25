import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createGoogleOidcClient } from './oidc.ts';
import type { OidcClient } from './service.ts';
import { startMockOidcServer, type MockOidcServer } from './testing/mock-oidc-server.ts';

const CLIENT_ID = 'test-client';
const CLIENT_SECRET = 'test-secret';
const REDIRECT = 'http://localhost:5173/auth/google/callback';

let mock: MockOidcServer;
let oidc: OidcClient;

beforeAll(async () => {
	mock = await startMockOidcServer({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
	oidc = createGoogleOidcClient({
		clientId: CLIENT_ID,
		clientSecret: CLIENT_SECRET,
		redirectUri: REDIRECT,
		hostedDomain: 'fun.ac.jp',
		issuer: mock.issuer,
	});
});

afterAll(async () => {
	await mock.close();
});

beforeEach(() => {
	mock.tamper('none');
	mock.setIdentity({
		sub: 'g-1',
		email: 'taro@fun.ac.jp',
		hd: 'fun.ac.jp',
		name: '山田 太郎',
	});
});

/** ブラウザの代わり。認可の URL を開いて、Google から戻ってくる URL を受け取る */
async function browse(authorizationUrl: string): Promise<URL> {
	const response = await fetch(authorizationUrl, { redirect: 'manual' });
	expect(response.status).toBe(302);
	return new URL(response.headers.get('location')!);
}

describe('createAuthorization', () => {
	it('PKCE (S256)、state、nonce、スコープ、hd を付けた認可の URL を作る', async () => {
		const auth = await oidc.createAuthorization();
		const url = new URL(auth.url);
		expect(url.origin + url.pathname).toBe(`${mock.issuer}/authorize`);
		expect(url.searchParams.get('scope')).toBe('openid email profile');
		expect(url.searchParams.get('code_challenge_method')).toBe('S256');
		expect(url.searchParams.get('code_challenge')).toBeTruthy();
		expect(url.searchParams.get('state')).toBe(auth.state);
		expect(url.searchParams.get('nonce')).toBe(auth.nonce);
		expect(url.searchParams.get('hd')).toBe('fun.ac.jp');
		expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
		expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
		// コード検証子そのものは URL に載せない
		expect(auth.url).not.toContain(auth.codeVerifier);
	});

	it('呼ぶたびに、別の state と nonce と verifier を作る', async () => {
		const a = await oidc.createAuthorization();
		const b = await oidc.createAuthorization();
		expect(new Set([a.state, b.state, a.nonce, b.nonce, a.codeVerifier, b.codeVerifier]).size).toBe(
			6,
		);
	});
});

describe('exchange: 正常', () => {
	it('コードを ID トークンに交換し、署名を確かめて、中身を返す', async () => {
		const auth = await oidc.createAuthorization();
		const callback = await browse(auth.url);
		const claims = await oidc.exchange(callback, auth);
		expect(claims).toEqual({
			sub: 'g-1',
			email: 'taro@fun.ac.jp',
			emailVerified: true,
			hd: 'fun.ac.jp',
			name: '山田 太郎',
		});
	});

	it('email_verified が false のときは、そのまま false で返す (断る判断は decideSignIn)', async () => {
		mock.setIdentity({ sub: 'g-2', email: 'x@fun.ac.jp', email_verified: false, hd: 'fun.ac.jp' });
		const auth = await oidc.createAuthorization();
		expect((await oidc.exchange(await browse(auth.url), auth)).emailVerified).toBe(false);
	});

	it('hd がないアカウントは、hd なしで返す', async () => {
		mock.setIdentity({ sub: 'g-3', email: 'x@gmail.com' });
		const auth = await oidc.createAuthorization();
		const claims = await oidc.exchange(await browse(auth.url), auth);
		expect(claims).not.toHaveProperty('hd');
	});
});

describe('exchange: 不正な応答は、例外にする', () => {
	it('state が違えば断る', async () => {
		const auth = await oidc.createAuthorization();
		const callback = await browse(auth.url);
		await expect(oidc.exchange(callback, { ...auth, state: 'forged-state' })).rejects.toThrow();
	});

	it('nonce が違う ID トークン (リプレイなど) は断る', async () => {
		mock.tamper('wrong-nonce');
		const auth = await oidc.createAuthorization();
		await expect(oidc.exchange(await browse(auth.url), auth)).rejects.toThrow();
	});

	it('署名が違う ID トークンは断る', async () => {
		mock.tamper('wrong-key');
		const auth = await oidc.createAuthorization();
		await expect(oidc.exchange(await browse(auth.url), auth)).rejects.toThrow();
	});

	it('宛先 (aud) が違う ID トークンは断る', async () => {
		mock.tamper('wrong-audience');
		const auth = await oidc.createAuthorization();
		await expect(oidc.exchange(await browse(auth.url), auth)).rejects.toThrow();
	});

	it('期限切れの ID トークンは断る', async () => {
		mock.tamper('expired');
		const auth = await oidc.createAuthorization();
		await expect(oidc.exchange(await browse(auth.url), auth)).rejects.toThrow();
	});

	it('PKCE の verifier が違えば、コードを交換できない', async () => {
		const auth = await oidc.createAuthorization();
		const callback = await browse(auth.url);
		await expect(
			oidc.exchange(callback, {
				...auth,
				codeVerifier: 'wrong-verifier-wrong-verifier-wrong-verifier-0000',
			}),
		).rejects.toThrow();
	});

	it('同じコードは 2 回使えない', async () => {
		const auth = await oidc.createAuthorization();
		const callback = await browse(auth.url);
		await oidc.exchange(callback, auth);
		await expect(oidc.exchange(callback, auth)).rejects.toThrow();
	});
});

describe('http の issuer', () => {
	it('自分の PC (localhost) 以外の http の issuer は、使えない', async () => {
		const insecure = createGoogleOidcClient({
			clientId: CLIENT_ID,
			clientSecret: CLIENT_SECRET,
			redirectUri: REDIRECT,
			hostedDomain: 'fun.ac.jp',
			issuer: 'http://accounts.example.com',
		});
		await expect(insecure.createAuthorization()).rejects.toThrow();
	});
});

describe('createAuthorization の prompt', () => {
	it('ログアウトのあとに別のアカウントで入れるよう、Google のアカウントの選択画面を毎回出させる', async () => {
		for (const hostedDomainHint of [true, false]) {
			const auth = await oidc.createAuthorization({ hostedDomainHint });

			expect(new URL(auth.url).searchParams.get('prompt')).toBe('select_account');
		}
	});
});

describe('createAuthorization の hd', () => {
	it('テストアカウントの入口では、大学のドメインの絞り込み (hd) を付けない', async () => {
		const auth = await oidc.createAuthorization({ hostedDomainHint: false });

		expect(new URL(auth.url).searchParams.has('hd')).toBe(false);
	});
});
