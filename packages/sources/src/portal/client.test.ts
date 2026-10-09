import { readFileSync } from 'node:fs';
import desktopUserAgents from 'top-user-agents/desktop';
import { describe, expect, it } from 'vitest';
import { fetchPortalPage } from './client.ts';
import type { PortalFetch } from './http.ts';

const loginHtml = readFileSync(new URL('./fixtures/login.html', import.meta.url), 'utf8');
const lectureHtml = readFileSync(new URL('./fixtures/all-kinds.html', import.meta.url), 'utf8');

const NOW = new Date('2026-10-01T00:00:00Z');
const CREDENTIALS = { userId: 'u1', password: 'secret-pw' };

interface Call {
	readonly method: string;
	readonly url: string;
	readonly cookie: string | null;
	readonly body: string | null;
	readonly userAgent: string | null;
	readonly redirect: string | undefined;
}

const html = (body: string, init: ResponseInit = {}) =>
	new Response(body, {
		...init,
		headers: { 'Content-Type': 'text/html; charset=utf-8', ...init.headers },
	});

/** ポータルの代わり。ログインの POST が正しければ、Cookie を渡して 302 で返し、その Cookie があれば一覧を返す */
function fakePortal(
	options: { loginOk?: boolean; lecture?: (cookie: string | null) => Response } = {},
) {
	const calls: Call[] = [];
	const fetch: PortalFetch = (url, init) => {
		const headers = new Headers(init?.headers);
		const call: Call = {
			method: init?.method ?? 'GET',
			url,
			cookie: headers.get('Cookie'),
			body: typeof init?.body === 'string' ? init.body : null,
			userAgent: headers.get('User-Agent'),
			redirect: init?.redirect,
		};
		calls.push(call);
		const path = new URL(url).pathname;
		if (path === '/Login' && call.method === 'GET') {
			return Promise.resolve(
				html(loginHtml, { headers: { 'Set-Cookie': 'ASP.NET_SessionId=anon; path=/; HttpOnly' } }),
			);
		}
		if (path === '/Login' && call.method === 'POST') {
			if (options.loginOk === false) return Promise.resolve(html(loginHtml));
			return Promise.resolve(
				new Response(null, {
					status: 302,
					headers: [
						['Location', '/Pt/Home'],
						['Set-Cookie', '.ASPXAUTH=authed; path=/; HttpOnly'],
					],
				}),
			);
		}
		if (path === '/Pt/Home') return Promise.resolve(html('<html><body>ホーム</body></html>'));
		if (path === '/Pt/CSLecture') {
			if (options.lecture) return Promise.resolve(options.lecture(call.cookie));
			return Promise.resolve(
				call.cookie?.includes('.ASPXAUTH=authed') ? html(lectureHtml) : html(loginHtml),
			);
		}
		return Promise.resolve(new Response('not found', { status: 404 }));
	};
	return { fetch, calls };
}

describe('ポータルの一覧の取得', () => {
	it('ログインして、同じ Cookie で一覧を取得する', async () => {
		const portal = fakePortal();
		const result = await fetchPortalPage({
			fetch: portal.fetch,
			credentials: CREDENTIALS,
			lastAttemptAt: null,
			now: NOW,
		});
		expect(result).toMatchObject({ kind: 'ok', html: lectureHtml });
		expect(portal.calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
			'GET /Login',
			'POST /Login',
			'GET /Pt/CSLecture',
		]);
		// ログインの POST には、最初の応答の Cookie を付け、一覧には、ログイン後の Cookie を付ける
		expect(portal.calls[1]!.cookie).toContain('ASP.NET_SessionId=anon');
		expect(portal.calls[2]!.cookie).toContain('.ASPXAUTH=authed');
		const body = new URLSearchParams(portal.calls[1]!.body!);
		expect(body.get('ctl00$MainContent$LoginId')).toBe('u1');
		expect(body.get('ctl00$MainContent$TargetYearList')).toBe('2026');
		expect(body.get('__VIEWSTATE')).toBe('dummy-viewstate+/=');
	});

	it('リダイレクトは自分でたどり、通信はポータルのホストだけに向ける', async () => {
		const portal = fakePortal();
		await fetchPortalPage({
			fetch: portal.fetch,
			credentials: CREDENTIALS,
			lastAttemptAt: null,
			now: NOW,
		});
		expect(portal.calls.every((c) => c.redirect === 'manual')).toBe(true);
		expect(portal.calls.every((c) => new URL(c.url).host === 'students.fun.ac.jp')).toBe(true);
	});

	it('User-Agent は、一般的なブラウザのものにする', async () => {
		const portal = fakePortal();
		await fetchPortalPage({
			fetch: portal.fetch,
			credentials: CREDENTIALS,
			lastAttemptAt: null,
			now: NOW,
		});
		expect(portal.calls[0]!.userAgent).toBe(desktopUserAgents[0]);
		expect(portal.calls[0]!.userAgent).toMatch(/^Mozilla\/5\.0 .*Chrome\//);
	});

	it('前回の試みから 60 分たっていなければ、通信せずに断る', async () => {
		const portal = fakePortal();
		const result = await fetchPortalPage({
			fetch: portal.fetch,
			credentials: CREDENTIALS,
			lastAttemptAt: new Date(NOW.getTime() - 59 * 60 * 1000),
			now: NOW,
		});
		expect(result.kind).toBe('throttled');
		expect(portal.calls).toHaveLength(0);
	});

	it('ログインに失敗したら (ログイン画面に戻されたら)、失敗として返し、再試行しない', async () => {
		const portal = fakePortal({ loginOk: false });
		const result = await fetchPortalPage({
			fetch: portal.fetch,
			credentials: CREDENTIALS,
			lastAttemptAt: null,
			now: NOW,
		});
		expect(result).toMatchObject({ kind: 'login-failed' });
		expect(portal.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
	});

	it('失敗の説明に、パスワードを載せない', async () => {
		const portal = fakePortal({ loginOk: false });
		const result = await fetchPortalPage({
			fetch: portal.fetch,
			credentials: CREDENTIALS,
			lastAttemptAt: null,
			now: NOW,
		});
		expect(JSON.stringify(result)).not.toContain('secret-pw');
	});

	it('一覧がログイン画面だったら、セッション切れとして失敗にする', async () => {
		const portal = fakePortal({ lecture: () => html(loginHtml) });
		const result = await fetchPortalPage({
			fetch: portal.fetch,
			credentials: CREDENTIALS,
			lastAttemptAt: null,
			now: NOW,
		});
		expect(result.kind).toBe('login-failed');
	});

	it('ログイン画面の構造が変わっていたら、ログインを試みずに知らせる', async () => {
		const calls: string[] = [];
		const result = await fetchPortalPage({
			fetch: (url, init) => {
				calls.push(`${init?.method ?? 'GET'} ${url}`);
				return Promise.resolve(html('<html><body>メンテナンス中</body></html>'));
			},
			credentials: CREDENTIALS,
			lastAttemptAt: null,
			now: NOW,
		});
		expect(result.kind).toBe('structure-changed');
		expect(calls).toHaveLength(1);
	});

	it('HTML でない応答は捨てる', async () => {
		const result = await fetchPortalPage({
			fetch: () =>
				Promise.resolve(new Response('{}', { headers: { 'Content-Type': 'application/json' } })),
			credentials: CREDENTIALS,
			lastAttemptAt: null,
			now: NOW,
		});
		expect(result.kind).toBe('failed');
	});

	it('5 MB を超える応答は、読むのをやめる', async () => {
		const big = 'a'.repeat(5 * 1024 * 1024 + 1);
		const result = await fetchPortalPage({
			fetch: () => Promise.resolve(html(big)),
			credentials: CREDENTIALS,
			lastAttemptAt: null,
			now: NOW,
		});
		expect(result.kind).toBe('failed');
	});

	it('別のホストへのリダイレクトには、従わない', async () => {
		const result = await fetchPortalPage({
			fetch: () =>
				Promise.resolve(
					new Response(null, { status: 302, headers: { Location: 'https://evil.example/' } }),
				),
			credentials: CREDENTIALS,
			lastAttemptAt: null,
			now: NOW,
		});
		expect(result.kind).toBe('failed');
	});

	it('通信が例外になっても、投げずに失敗として返す', async () => {
		const result = await fetchPortalPage({
			fetch: () => Promise.reject(new Error('ECONNRESET')),
			credentials: CREDENTIALS,
			lastAttemptAt: null,
			now: NOW,
		});
		expect(result.kind).toBe('failed');
	});
});
