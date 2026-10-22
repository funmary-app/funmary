// 公開 API、MCP、OAuth。
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { oidc, seedSubjects, signIn, useMockOidc, answerConfirm } from './support.ts';

// サーバーの状態 (次にログインする人) を共有するので、テストは 1 つずつ動かす
test.describe.configure({ mode: 'serial' });
useMockOidc();

test.describe('公開 API と MCP', () => {
	test('個人用のアクセストークンを発行、一覧、無効化でき、API から自分の時間割を読める', async ({
		page,
		request,
	}) => {
		const email = `e2e-tokens-${Date.now()}@fun.ac.jp`;
		oidc.setIdentity({ sub: email, email, email_verified: true, hd: 'fun.ac.jp' });
		await signIn(page);
		await page.goto('/app/settings');
		await page.getByRole('link', { name: '公開 API と MCP' }).click();
		await expect(page.getByRole('heading', { level: 1, name: '公開 API と MCP' })).toBeVisible();

		await page.getByLabel('名前 (どこで使うかのメモ)').fill('e2e のテスト');
		await page.getByLabel('今日や週の授業').check();
		await page.getByRole('button', { name: '発行する' }).click();
		await expect(page.getByText('を発行しました', { exact: false })).toBeVisible();

		const token = await page.locator('#new-token').inputValue();
		expect(token).toMatch(/^fmy_/);

		const item = page.getByRole('listitem').filter({ hasText: 'e2e のテスト' });
		await expect(item).toContainText('read:lessons');

		// 発行したトークンで、公開 API から自分のデータだけを読める
		const res = await request.get('/api/v1/lessons?start=2026-10-01&end=2026-10-07', {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.status()).toBe(200);
		expect(await res.json()).toEqual([]);

		const noToken = await request.get('/api/v1/lessons?start=2026-10-01&end=2026-10-07');
		expect(noToken.status()).toBe(401);

		// 確認でキャンセルすると、トークンは無効にならない
		await item.getByRole('button', { name: '無効にする' }).click();
		await answerConfirm(page, false);
		await page.reload();
		await expect(item).toHaveCount(1);
		const afterDismiss = await request.get('/api/v1/lessons?start=2026-10-01&end=2026-10-07', {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(afterDismiss.status()).toBe(200);

		await item.getByRole('button', { name: '無効にする' }).click();
		await answerConfirm(page, true);
		await expect(item).toHaveCount(0);

		const afterRevoke = await request.get('/api/v1/lessons?start=2026-10-01&end=2026-10-07', {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(afterRevoke.status()).toBe(401);
	});

	test('書き込みの範囲のトークンで予定を足せて、設定の履歴にトークンの名前が残る。読み取りだけのトークンでは足せない', async ({
		page,
		request,
	}) => {
		const email = `e2e-write-${Date.now()}@fun.ac.jp`;
		oidc.setIdentity({ sub: email, email, email_verified: true, hd: 'fun.ac.jp' });
		await signIn(page);
		await page.goto('/app/settings/tokens');

		// 書き込みの範囲は、初めはオフ。読み取りだけのトークンでは、予定を足せない
		await expect(page.getByLabel('予定を足す、直す、消す')).not.toBeChecked();
		await page.getByLabel('名前 (どこで使うかのメモ)').fill('読むだけ');
		await page.getByLabel('今日や週の授業').check();
		await page.getByRole('button', { name: '発行する' }).click();
		const readOnly = await page.locator('#new-token').inputValue();
		const event = {
			title: 'E2E の予定',
			startDate: '2030-01-07',
			time: { kind: 'allDay' },
		};
		const denied = await request.post('/api/v1/events', {
			headers: { Authorization: `Bearer ${readOnly}` },
			data: event,
		});
		expect(denied.status()).toBe(403);

		await page.goto('/app/settings/tokens');
		await page.getByLabel('名前 (どこで使うかのメモ)').fill('予定の登録用');
		await page.getByLabel('予定を足す、直す、消す').check();
		await page.getByRole('button', { name: '発行する' }).click();
		const writer = await page.locator('#new-token').inputValue();

		// 手元の MCP の設定と、コマンドのログインの例が、この Funmary の URL で出る (トークンは、設定の例にだけ入る)
		await expect(page.getByText('"@funmary/mcp"')).toBeVisible();
		await expect(page.getByText('npx funmary login --url http://localhost:4173')).toBeVisible();
		await expect(page.locator('pre', { hasText: 'FUNMARY_TOKEN' })).toContainText(writer);

		const created = await request.post('/api/v1/events', {
			headers: { Authorization: `Bearer ${writer}` },
			data: event,
		});
		expect(created.status()).toBe(201);
		const { id } = (await created.json()) as { id: number };

		// 画面の予定の一覧に出て、設定の履歴に、どのトークンが足したかが残る
		await page.goto('/app/events');
		await expect(page.getByText('E2E の予定').first()).toBeVisible();
		await page.goto('/app/settings/tokens');
		const history = page.getByRole('region', { name: '書き込みの履歴' });
		await expect(history).toContainText('予定「E2E の予定」を足した');
		await expect(history).toContainText('予定の登録用');

		const removed = await request.delete(`/api/v1/events/${id}`, {
			headers: { Authorization: `Bearer ${writer}` },
		});
		expect(removed.status(), await removed.text()).toBe(204);
		await page.reload();
		await expect(history).toContainText('予定「E2E の予定」を消した');
	});

	test('履修の書き込みの範囲のトークンで、履修登録と略称を書き込め、画面と設定の履歴に出る。名前の曖昧さは登録しない', async ({
		page,
		request,
	}) => {
		seedSubjects(() => undefined);
		const email = `e2e-courses-${Date.now()}@fun.ac.jp`;
		oidc.setIdentity({ sub: email, email, email_verified: true, hd: 'fun.ac.jp' });
		await signIn(page);
		await page.goto('/app/settings/tokens');
		await expect(
			page.getByLabel('履修登録、自分だけの曜日と時限、略称を書き換える'),
		).not.toBeChecked();
		await page.getByLabel('名前 (どこで使うかのメモ)').fill('履修の登録用');
		await page.getByLabel('履修登録、自分だけの曜日と時限、略称を書き換える').check();
		await page.getByRole('button', { name: '発行する' }).click();
		const writer = await page.locator('#new-token').inputValue();
		const headers = { Authorization: `Bearer ${writer}` };

		const registered = await request.post('/api/v1/courses', {
			headers,
			data: { academicYear: 2026, syllabusId: '900001' },
		});
		expect(registered.status(), await registered.text()).toBe(200);
		expect(await registered.json()).toMatchObject({ registered: true });

		const slot = await request.put('/api/v1/courses/2026/900001/personal-slots', {
			headers,
			data: { weekday: 2, period: 3, room: 'E2E 教室' },
		});
		expect(slot.status(), await slot.text()).toBe(200);
		const abbreviation = await request.put('/api/v1/courses/2026/900001/abbreviation', {
			headers,
			data: { abbreviation: 'E2E演習' },
		});
		expect(abbreviation.status()).toBe(200);
		const missing = await request.post('/api/v1/courses', {
			headers,
			data: { name: '存在しない科目' },
		});
		expect(missing.status()).toBe(404);

		await page.goto('/app/courses');
		await expect(page.getByText('架空の演習Ⅱ1-AB').first()).toBeVisible();
		await page.goto('/app/settings/tokens');
		const history = page.getByRole('region', { name: '書き込みの履歴' });
		await expect(history).toContainText('履修科目に「架空の演習Ⅱ1-AB」を登録した');
		await expect(history).toContainText('履修の登録用');

		const unregistered = await request.delete('/api/v1/courses/2026/900001', { headers });
		expect(unregistered.status()).toBe(200);
		expect(await unregistered.json()).toMatchObject({ registered: false });
	});

	test('MCP の認可 (OAuth): 登録、ログイン、同意、トークンの引き換え、リフレッシュ、取り消し', async ({
		page,
		request,
	}) => {
		// 戻り先は、手元で受けるだけの小さなサーバー (http のループバックは、戻り先に使える)
		const sink = createServer((_req, res) => res.end('ok'));
		await new Promise<void>((resolve) => sink.listen(0, '127.0.0.1', resolve));
		const sinkHost = `127.0.0.1:${(sink.address() as AddressInfo).port}`;
		const redirectUri = `http://${sinkHost}/api/mcp/auth_callback`;
		sink.unref();
		const returnedTo = () =>
			page.waitForRequest((req) => req.url().startsWith(`http://${sinkHost}/`));

		// 認証のないリクエストは、保護されたリソースの情報の場所を知らせる
		const unauthorized = await request.post('/mcp', { data: {} });
		expect(unauthorized.status()).toBe(401);
		expect(unauthorized.headers()['www-authenticate']).toContain(
			'/.well-known/oauth-protected-resource/mcp',
		);
		const metadata = await request.get('/.well-known/oauth-authorization-server');
		expect(metadata.ok()).toBe(true);

		const registered = await request.post('/oauth/register', {
			data: { client_name: 'テスト用のクライアント', redirect_uris: [redirectUri] },
		});
		expect(registered.status()).toBe(201);
		const { client_id: clientId } = (await registered.json()) as { client_id: string };

		const verifier = 'v'.repeat(64);
		const challenge = createHash('sha256').update(verifier).digest('base64url');
		const authorizeUrl = `/oauth/authorize?${new URLSearchParams({
			client_id: clientId,
			redirect_uri: redirectUri,
			response_type: 'code',
			code_challenge: challenge,
			code_challenge_method: 'S256',
			state: 'st 1',
			scope: 'read:lessons',
		})}`;

		// ログインしていないと、ログインに送られ、ログインのあとに同意の画面へ戻る
		const email = `e2e-oauth-${Date.now()}@fun.ac.jp`;
		oidc.setIdentity({ sub: email, email, email_verified: true, hd: 'fun.ac.jp' });
		await page.goto(authorizeUrl);
		await expect(page).toHaveURL('/login');
		await signIn(page);
		await expect(page).toHaveURL(/\/oauth\/authorize\?/);
		await expect(page.getByRole('heading', { level: 1, name: 'アクセスの許可' })).toBeVisible();
		await expect(page.getByText('テスト用のクライアント')).toBeVisible();
		await expect(page.getByText(sinkHost)).toBeVisible();
		await expect(page.getByLabel('今日や週の授業')).toBeChecked();
		await expect(page.getByLabel('通知欄')).toHaveCount(0);

		// 拒否すると、error=access_denied で戻り、コードは出ない
		const denied = returnedTo();
		await page.getByRole('button', { name: '許可しない' }).click();
		const deniedUrl = new URL((await denied).url());
		expect(deniedUrl.searchParams.get('error')).toBe('access_denied');
		expect(deniedUrl.searchParams.get('state')).toBe('st 1');
		expect(deniedUrl.searchParams.has('code')).toBe(false);

		// 許可すると、code と state が付いて戻る
		await page.goto(authorizeUrl);
		const allowed = returnedTo();
		await page.getByRole('button', { name: '許可する' }).click();
		const back = new URL((await allowed).url());
		expect(back.searchParams.get('state')).toBe('st 1');
		const code = back.searchParams.get('code') ?? '';

		const exchanged = await request.post('/oauth/token', {
			form: {
				grant_type: 'authorization_code',
				client_id: clientId,
				code,
				redirect_uri: redirectUri,
				code_verifier: verifier,
			},
		});
		expect(exchanged.status()).toBe(200);
		const tokens = (await exchanged.json()) as { access_token: string; refresh_token: string };

		// 発行されたアクセストークンで、公開 API と MCP につながる
		const lessons = await request.get('/api/v1/lessons?start=2026-10-01&end=2026-10-07', {
			headers: { Authorization: `Bearer ${tokens.access_token}` },
		});
		expect(lessons.status()).toBe(200);
		const initialized = await request.post('/mcp', {
			headers: {
				Authorization: `Bearer ${tokens.access_token}`,
				Accept: 'application/json, text/event-stream',
			},
			data: {
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: {
					protocolVersion: '2025-06-18',
					capabilities: {},
					clientInfo: { name: 'e2e', version: '1' },
				},
			},
		});
		expect(initialized.status()).toBe(200);
		expect(await initialized.text()).toContain('/brand/icon-512.png');

		// 同じコードは、もう使えない
		const replay = await request.post('/oauth/token', {
			form: {
				grant_type: 'authorization_code',
				client_id: clientId,
				code,
				redirect_uri: redirectUri,
				code_verifier: verifier,
			},
		});
		expect(replay.status()).toBe(400);

		// リフレッシュで替わり、古いアクセストークンは使えなくなる
		const refreshed = await request.post('/oauth/token', {
			form: {
				grant_type: 'refresh_token',
				client_id: clientId,
				refresh_token: tokens.refresh_token,
			},
		});
		expect(refreshed.status()).toBe(200);
		const next = (await refreshed.json()) as { access_token: string; refresh_token: string };
		const oldAccess = await request.get('/api/v1/lessons?start=2026-10-01&end=2026-10-07', {
			headers: { Authorization: `Bearer ${tokens.access_token}` },
		});
		expect(oldAccess.status()).toBe(401);

		// 設定の画面から無効にすると、リフレッシュもできなくなる
		await page.goto('/app/settings/tokens');
		const item = page.getByRole('listitem').filter({ hasText: 'テスト用のクライアント (OAuth)' });
		await expect(item).toHaveCount(1);
		await item.getByRole('button', { name: '無効にする' }).click();
		await answerConfirm(page, true);
		await expect(item).toHaveCount(0);
		const afterRevoke = await request.post('/oauth/token', {
			form: {
				grant_type: 'refresh_token',
				client_id: clientId,
				refresh_token: next.refresh_token,
			},
		});
		expect(afterRevoke.status()).toBe(400);
	});

	test('/api/docs と /api/v1/openapi.json は、ログインなしで開ける', async ({ request }) => {
		const docs = await request.get('/api/docs');
		expect(docs.status()).toBe(200);
		const spec = await request.get('/api/v1/openapi.json');
		expect(spec.status()).toBe(200);
		const body = (await spec.json()) as { openapi: string };
		expect(body.openapi).toMatch(/^3\.1/);
	});
});
