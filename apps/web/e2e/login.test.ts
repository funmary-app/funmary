// Google のログインの通し。Google の代わりに、テスト用の OpenID Connect のサーバーを使う (support.ts)。
// サーバーは本物の RS256 で署名した ID トークンを返すので、アプリは本番と同じ手順 (PKCE、state、nonce、署名の検証) を通る。
import { expect, test, type Page } from '@playwright/test';
import { oidc, signIn, useMockOidc, answerConfirm } from './support.ts';

useMockOidc();

test('共有したときのカード (OGP) の情報を出し、画像は絶対 URL で配る', async ({
	page,
	request,
}) => {
	await page.goto('/');
	const image = await page.locator('meta[property="og:image"]').getAttribute('content');
	expect(image).toMatch(/^https?:\/\/[^/]+\/brand\/og-image\.png$/);
	await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Funmary');
	await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
		'content',
		'summary_large_image',
	);
	const response = await request.get(new URL(image ?? '').pathname);
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toBe('image/png');
});

test('ロゴとアイコンを /brand で配り、決まった名前のほかは返さない', async ({ request, page }) => {
	for (const [name, type] of [
		['logo-light.svg', 'image/svg+xml'],
		['icon.svg', 'image/svg+xml'],
		['icon-dark.svg', 'image/svg+xml'],
		['og-image.png', 'image/png'],
	]) {
		const response = await request.get(`/brand/${name}`);
		expect(response.status(), name).toBe(200);
		expect(response.headers()['content-type']).toBe(type);
	}
	expect((await request.get('/brand/secret.txt')).status()).toBe(404);

	await page.goto('/');
	await expect(page.getByRole('link', { name: 'Funmary' }).first()).toBeVisible();
});

test.describe('ホーム画面に追加 (PWA)', () => {
	test('マニフェストとアイコンを配る', async ({ request }) => {
		const manifest = await request.get('/manifest.webmanifest');
		expect(manifest.status()).toBe(200);
		expect(manifest.headers()['content-type']).toContain('manifest+json');
		const body = (await manifest.json()) as { icons: { src: string }[] };
		expect(body).toMatchObject({ start_url: '/app', scope: '/app', display: 'standalone' });
		for (const icon of [
			...body.icons.map((i: { src: string }) => i.src),
			'/brand/apple-touch-icon.png',
		]) {
			const response = await request.get(icon);
			expect(response.status(), icon).toBe(200);
			expect(response.headers()['content-type']).toBe('image/png');
		}
	});

	test('ブラウザで開くと、ホームに追加のやり方を出し、追加したアプリで開くと出さない。折りたたむと、次に開いたときも折りたたんだまま', async ({
		browser,
	}) => {
		const email = 'e2e-pwa@fun.ac.jp';
		const login = async (page: Page) => {
			await oidc.setIdentity({ sub: email, email, email_verified: true, hd: 'fun.ac.jp' });
			await signIn(page);
			await expect(page).toHaveURL('/app');
		};

		const browserPage = await (await browser.newContext()).newPage();
		await login(browserPage);
		const heading = browserPage.getByRole('heading', { name: 'アプリとして使う' });
		await expect(heading).toBeVisible();
		await expect(browserPage.getByText('プッシュ通知は、今後対応する予定')).toBeVisible();

		// 折りたたむと、開き直しても折りたたんだまま (このブラウザだけ覚える)
		// 画面が動き出す前に押すと、動き出したときに開き直される。折りたたまれるまで押し直す
		await expect(async () => {
			await heading.click();
			await expect(browserPage.getByText('プッシュ通知は、今後対応する予定')).toBeHidden({
				timeout: 1000,
			});
		}).toPass();
		await browserPage.reload();
		await expect(browserPage.getByRole('heading', { name: 'アプリとして使う' })).toBeVisible();
		await expect(browserPage.getByText('プッシュ通知は、今後対応する予定')).toBeHidden();

		// iOS のホーム画面のアプリは、navigator.standalone が true になる
		const context = await browser.newContext();
		await context.addInitScript(() => {
			Object.defineProperty(navigator, 'standalone', { value: true });
		});
		const installedPage = await context.newPage();
		await login(installedPage);
		await expect(installedPage.getByRole('heading', { name: 'ホーム', exact: true })).toBeVisible();
		await expect(installedPage.getByRole('heading', { name: 'アプリとして使う' })).toHaveCount(0);
	});
});

test('大学のアカウントでログインでき、ログアウトできる', async ({ page }) => {
	await oidc.setIdentity({
		sub: 'e2e-taro',
		email: 'taro@fun.ac.jp',
		email_verified: true,
		hd: 'fun.ac.jp',
		name: '山田 太郎',
	});
	await page.goto('/login');
	await page.getByRole('link', { name: 'Google でログイン' }).click();

	// 初めてのログインでは、利用規約への同意の画面が先に出る (同意の流れそのものは、専用のテストで確かめる。
	// 手元で E2E を続けて動かすと、前の回で同意済みの利用者になるので、画面が出たときだけ同意する)
	await page.waitForURL(/\/(app|consent)/);
	if (new URL(page.url()).pathname === '/consent') {
		await page.getByLabel('利用規約とプライバシーポリシーに同意します').check();
		await page.getByRole('button', { name: '同意して続ける' }).click();
	}

	await expect(page).toHaveURL('/app');
	// メールアドレスの @ より前は、押すまで出さない
	const menu = page.getByRole('navigation', { name: 'メニュー' });
	await expect(menu).toContainText('••••••••@fun.ac.jp');
	await expect(menu).not.toContainText('taro@');
	await menu.getByRole('button', { name: 'メールアドレスを表示する' }).click();
	await expect(menu.getByText('taro@fun.ac.jp')).toBeVisible();
	await menu.getByRole('button', { name: 'メールアドレスを隠す' }).click();
	await expect(menu).not.toContainText('taro@');

	// セッションは HttpOnly の Cookie で、画面の JavaScript から読めない
	const cookies = await page.context().cookies();
	const session = cookies.find((c) => c.name === 'funmary_session');
	expect(session?.httpOnly).toBe(true);
	expect(session?.sameSite).toBe('Lax');
	expect(await page.evaluate(() => document.cookie)).not.toContain('funmary_session');

	// ログイン済みなら、ログインの画面は開かず、アプリに移る
	await page.goto('/login');
	await expect(page).toHaveURL('/app');

	// 紹介の画面は、ログインしていても見られ、アプリへの入口を出す
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'大学の「知りたい」を、すべて。',
	);
	await page.getByRole('link', { name: 'アプリを開く' }).click();
	await expect(page).toHaveURL('/app');

	// ログアウトは、メニューではなく、設定の中にある
	await expect(menu.getByRole('button', { name: 'ログアウト' })).toHaveCount(0);
	await page.goto('/app/settings');
	await page.getByRole('button', { name: 'ログアウト' }).click();
	await answerConfirm(page, true);
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('link', { name: '大学のアカウントではじめる' })).toBeVisible();
	expect((await page.context().cookies()).some((c) => c.name === 'funmary_session')).toBe(false);
});

test.describe('利用規約への同意', () => {
	test('初めてのログインでは同意の画面が出て、同意するまでアプリを使えない。同意すると、行こうとした画面へ進む', async ({
		page,
	}) => {
		const email = `e2e-consent-${Date.now()}@fun.ac.jp`;
		await oidc.setIdentity({ sub: email, email, email_verified: true, hd: 'fun.ac.jp' });
		await page.goto('/auth/google');
		await expect(page).toHaveURL('/consent?next=%2Fapp');
		await expect(page.getByRole('heading', { level: 1, name: '利用規約への同意' })).toBeVisible();

		// アプリの画面は、同意の画面に送り返される。行こうとした画面は覚えている
		await page.goto('/app/week');
		await expect(page).toHaveURL('/consent?next=%2Fapp%2Fweek');

		// フォームの送信など、画面を経由しない操作も止まる
		const post = await page.request.post('/app/settings/tokens?/issue', {
			headers: { Origin: new URL(page.url()).origin },
			form: { name: 'x', scope: 'read:lessons' },
		});
		expect(post.status()).toBe(403);

		// 規約の本文は、同意の前でも読める
		await page.goto('/terms');
		await expect(page.getByRole('heading', { level: 1, name: '利用規約' })).toBeVisible();

		await page.goto('/consent?next=%2Fapp%2Fweek');
		await page.getByRole('button', { name: '同意して続ける' }).click();
		// チェックを入れていないと、ブラウザが送らせない
		await expect(page).toHaveURL('/consent?next=%2Fapp%2Fweek');
		await page.getByLabel('利用規約とプライバシーポリシーに同意します').check();
		await page.getByRole('button', { name: '同意して続ける' }).click();
		await expect(page).toHaveURL('/app/week');

		// 同意したあとは、同意の画面を開いても、アプリへ進む
		await page.goto('/consent');
		await expect(page).toHaveURL('/app');
	});

	test('同意せずにログアウトできる。外のサイトへ戻る指定は受け付けない', async ({ page }) => {
		const email = `e2e-decline-${Date.now()}@fun.ac.jp`;
		await oidc.setIdentity({ sub: email, email, email_verified: true, hd: 'fun.ac.jp' });
		await page.goto('/auth/google');
		await expect(page).toHaveURL('/consent?next=%2Fapp');
		await page.getByRole('button', { name: '同意せずにログアウト' }).click();
		await expect(page).toHaveURL('/');
		expect((await page.context().cookies()).some((c) => c.name === 'funmary_session')).toBe(false);

		await page.goto('/auth/google');
		await page.goto('/consent?next=https%3A%2F%2Fevil.example%2F');
		await page.getByLabel('利用規約とプライバシーポリシーに同意します').check();
		await page.getByRole('button', { name: '同意して続ける' }).click();
		await expect(page).toHaveURL('/app');
	});
});

test('大学のアカウントでなければ、ログインできず、理由が出る', async ({ page }) => {
	await oidc.setIdentity({
		sub: 'e2e-outsider',
		email: 'someone@example.com',
		email_verified: true,
	});
	await signIn(page);
	await expect(page).toHaveURL(/\/login\?error=/);
	await expect(page.getByRole('alert')).toContainText('大学');
	expect((await page.context().cookies()).some((c) => c.name === 'funmary_session')).toBe(false);
});

test('署名の合わない ID トークンは、受け付けない', async ({ page }) => {
	await oidc.setIdentity({
		sub: 'e2e-forged',
		email: 'forged@fun.ac.jp',
		email_verified: true,
		hd: 'fun.ac.jp',
	});
	await oidc.tamper('wrong-key');
	await signIn(page);
	await expect(page).toHaveURL('/login?error=invalid-callback');
	await expect(page.getByRole('alert')).toBeVisible();
	expect((await page.context().cookies()).some((c) => c.name === 'funmary_session')).toBe(false);
});

test('ログインの途中の Cookie がなければ、やり直しになる', async ({ page }) => {
	await page.goto('/auth/google/callback?code=x&state=y');
	await expect(page).toHaveURL('/login?error=flow-expired');
});

test('知らない理由を URL に書いても、画面には何も出ない', async ({ page }) => {
	await page.goto('/login?error=%3Cscript%3Ealert(1)%3C/script%3E');
	await expect(page.getByRole('alert')).toHaveCount(0);
});
