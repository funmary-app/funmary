import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startMockOidcServer, type MockOidcServer } from './mock-oidc-server.ts';

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function publishedKeys(keyFile?: string): Promise<unknown> {
	const server = await startMockOidcServer({
		clientId: 'client',
		clientSecret: 'secret',
		...(keyFile && { keyFile }),
	});
	try {
		return await (await fetch(`${server.issuer}/jwks`)).json();
	} finally {
		await server.close();
	}
}

describe('startMockOidcServer', () => {
	it('keyFile を渡すと、立て直しても同じ署名の鍵を使う (アプリが覚えた公開鍵で検証できるように)', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'funmary-mock-oidc-'));
		dirs.push(dir);
		const keyFile = join(dir, 'key.pem');
		expect(await publishedKeys(keyFile)).toEqual(await publishedKeys(keyFile));
	});

	it('keyFile を渡さなければ、立てるたびに鍵を作る', async () => {
		expect(await publishedKeys()).not.toEqual(await publishedKeys());
	});
});

/** ブラウザの代わりに認可から ID トークンまで進み、ID トークンの中身を返す */
async function signInWith(server: MockOidcServer, client?: string) {
	const verifier = 'v'.repeat(43);
	const authorize = new URL(`${server.issuer}/authorize`);
	authorize.search = new URLSearchParams({
		client_id: 'client',
		redirect_uri: 'http://localhost/callback',
		state: 'state',
		nonce: 'nonce',
		code_challenge: createHash('sha256').update(verifier).digest('base64url'),
		code_challenge_method: 'S256',
	}).toString();
	const redirect = await fetch(authorize, {
		redirect: 'manual',
		headers: client === undefined ? {} : { 'x-e2e-worker': client },
	});
	const code = new URL(redirect.headers.get('location') ?? '').searchParams.get('code') ?? '';
	const token = await fetch(`${server.issuer}/token`, {
		method: 'POST',
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			code_verifier: verifier,
			client_id: 'client',
			client_secret: 'secret',
		}),
	});
	const { id_token: idToken } = (await token.json()) as { id_token: string };
	return JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString()) as {
		sub: string;
		aud: string;
	};
}

describe('ログインする人を、x-e2e-worker ごとに分ける (E2E のワーカーを並べて動かすため)', () => {
	it('HTTP で決めた人で、その x-e2e-worker からのログインを受ける。ほかのワーカーには効かない', async () => {
		const server = await startMockOidcServer({ clientId: 'client', clientSecret: 'secret' });
		try {
			for (const [client, sub] of [
				['1', 'first'],
				['2', 'second'],
			]) {
				await fetch(`${server.issuer}/__mock/identity`, {
					method: 'POST',
					body: JSON.stringify({ client, identity: { sub, email: `${sub}@fun.ac.jp` } }),
				});
			}
			expect((await signInWith(server, '1')).sub).toBe('first');
			expect((await signInWith(server, '2')).sub).toBe('second');
		} finally {
			await server.close();
		}
	});

	it('ID トークンを壊す指定も、その x-e2e-worker からのログインにだけ効く', async () => {
		const server = await startMockOidcServer({ clientId: 'client', clientSecret: 'secret' });
		try {
			await fetch(`${server.issuer}/__mock/tamper`, {
				method: 'POST',
				body: JSON.stringify({ client: '1', mode: 'wrong-audience' }),
			});
			expect((await signInWith(server, '1')).aud).toBe('someone-else');
			expect((await signInWith(server, '2')).aud).toBe('client');
		} finally {
			await server.close();
		}
	});

	it('x-e2e-worker がなければ、setIdentity で決めた人にする (単体テストの使い方)', async () => {
		const server = await startMockOidcServer({ clientId: 'client', clientSecret: 'secret' });
		try {
			server.setIdentity({ sub: 'direct', email: 'direct@fun.ac.jp' });
			expect((await signInWith(server)).sub).toBe('direct');
		} finally {
			await server.close();
		}
	});
});
