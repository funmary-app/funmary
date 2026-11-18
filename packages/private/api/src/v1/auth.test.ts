import type { AccessTokenOwner } from '@funmary/db';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { TermsGate } from '../terms-gate.ts';
import { requireScope, v1Auth, type V1AuthVariables } from './auth.ts';

function appWith(owner: AccessTokenOwner | null, termsGate?: TermsGate) {
	const app = new Hono<{ Variables: V1AuthVariables }>();
	app.use(
		'/*',
		v1Auth({ accessTokens: { findOwner: () => owner, markUsed: () => undefined }, termsGate }),
	);
	app.get('/lessons', requireScope('read:lessons'), (c) => c.json(c.get('tokenOwner')));
	return app;
}

describe('v1Auth', () => {
	it('Authorization ヘッダがなければ 401', async () => {
		const app = appWith(null);
		const res = await app.request('/lessons');
		expect(res.status).toBe(401);
	});

	it('Bearer でないヘッダは 401', async () => {
		const app = appWith(null);
		const res = await app.request('/lessons', { headers: { Authorization: 'Basic abc' } });
		expect(res.status).toBe(401);
	});

	it('知らない、期限切れのトークンは 401', async () => {
		const app = appWith(null);
		const res = await app.request('/lessons', { headers: { Authorization: 'Bearer fmy_x' } });
		expect(res.status).toBe(401);
	});

	it('有効なトークンなら、持ち主を c.var.tokenOwner に置く', async () => {
		const app = appWith({
			id: 1,
			userId: 'u1',
			name: 'test',
			scopes: ['read:lessons'],
			termsAcceptedVersion: null,
		});
		const res = await app.request('/lessons', { headers: { Authorization: 'Bearer fmy_x' } });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			userId: 'u1',
			scopes: ['read:lessons'],
			tokenId: 1,
			tokenName: 'test',
		});
	});
});

describe('requireScope', () => {
	it('範囲が足りなければ 403', async () => {
		const app = appWith({
			id: 1,
			userId: 'u1',
			name: 'test',
			scopes: ['read:changes'],
			termsAcceptedVersion: null,
		});
		const res = await app.request('/lessons', { headers: { Authorization: 'Bearer fmy_x' } });
		expect(res.status).toBe(403);
	});
});

describe('利用規約への再同意', () => {
	const gate: TermsGate = {
		version: '2026-10-03',
		consentUrl: 'https://funmary.example.com/consent',
	};
	const owner = (termsAcceptedVersion: string | null): AccessTokenOwner => ({
		id: 1,
		userId: 'u1',
		name: 'test',
		scopes: ['read:lessons'],
		termsAcceptedVersion,
	});
	const call = (app: ReturnType<typeof appWith>) =>
		app.request('/lessons', { headers: { Authorization: 'Bearer fmy_x' } });

	it('いまの版に同意していれば、通す', async () => {
		const res = await call(appWith(owner('2026-10-03'), gate));
		expect(res.status).toBe(200);
	});

	it('一度も同意していないか、古い版なら 403 で、専用のエラーと同意画面の URL を返す', async () => {
		for (const accepted of [null, '2026-09-20']) {
			const res = await call(appWith(owner(accepted), gate));
			expect(res.status).toBe(403);
			expect(res.headers.get('Link')).toBe(
				'<https://funmary.example.com/consent>; rel="terms-of-service"',
			);
			expect(await res.json()).toMatchObject({
				error: 'terms_not_accepted',
				consentUrl: 'https://funmary.example.com/consent',
				message: expect.stringContaining('https://funmary.example.com/consent') as string,
			});
		}
	});

	it('同意を求めていなければ (gate がなければ)、同意していなくても通す', async () => {
		const res = await call(appWith(owner(null)));
		expect(res.status).toBe(200);
	});

	it('トークンが正しくなければ、同意より先に 401', async () => {
		const res = await call(appWith(null, gate));
		expect(res.status).toBe(401);
	});
});
