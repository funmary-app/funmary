import { expect, test } from '@playwright/test';

// E2E のサーバーは、だれでも登録できる設定 (REGISTRATION=open) で動かしている
test('ログインしていなければ、アプリの紹介と、はじめる入口を出す', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'大学の「知りたい」を、すべて。',
	);
	await expect(page.getByRole('link', { name: '大学のアカウントではじめる' })).toHaveAttribute(
		'href',
		'/auth/google',
	);
	// 招待コードの欄は、招待制のときだけ出す
	await expect(page.getByLabel('はじめての方は、招待コードで登録します')).toHaveCount(0);
	await expect(page.getByRole('region', { name: 'できること' }).getByRole('listitem')).toHaveCount(
		8,
	);
	await expect(page.getByText('準備中:')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Twitter (@funmary_app)' }).first()).toHaveAttribute(
		'href',
		'https://x.com/funmary_app',
	);
	await expect(page.getByText('公式のアプリではありません').first()).toBeVisible();
	// 画面の色のボタンは上部に置く
	await expect(page.getByRole('banner').getByRole('button', { name: /^画面の色/ })).toBeVisible();
});

// 1 px の透明な PNG。テストでは http.cat に通信せず、これを返す
const PIXEL = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
	'base64',
);

test('文字は、端末によらず、Funmary から配る LINE Seed JP で出す', async ({ page }) => {
	const fontRequests: string[] = [];
	page.on('request', (request) => {
		if (request.resourceType() === 'font') fontRequests.push(request.url());
	});
	await page.goto('/');
	await page.evaluate(() => document.fonts.ready);

	const loaded = await page.evaluate(() =>
		[...document.fonts]
			.filter((face) => face.status === 'loaded')
			.map((face) => face.family.replaceAll('"', '')),
	);
	expect(loaded).toContain('LINE Seed JP');
	// 外のサービス (Google Fonts など) からは読まない
	expect(fontRequests).not.toHaveLength(0);
	for (const url of fontRequests) expect(new URL(url).origin).toBe(new URL(page.url()).origin);
});

test('LINE Seed JP にない字 (名字の「﨑」など) は、Funmary から配る Noto Sans JP で補う', async ({
	page,
}) => {
	await page.goto('/');
	await page.evaluate(() => document.fonts.ready);
	// 授業や予定の名前に、この字が入ったときと同じにする
	await page.evaluate(() => {
		const name = document.createElement('p');
		name.textContent = '山﨑先生';
		document.body.append(name);
	});
	await expect
		.poll(() =>
			page.evaluate(() =>
				[...document.fonts]
					.filter((face) => face.status === 'loaded')
					.map((face) => face.family.replaceAll('"', '')),
			),
		)
		.toContain('Noto Sans JP');
});

test('ないページは、404 と、番号に合った http.cat の猫の画像を出す', async ({ page }) => {
	await page.route('https://http.cat/**', (route) =>
		route.fulfill({ contentType: 'image/png', body: PIXEL }),
	);
	const response = await page.goto('/no-such-page');
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('ページが見つかりません');
	// SvelteKit の既定の英語のメッセージは出さない
	await expect(page.getByText('Not Found')).toHaveCount(0);
	const image = page.getByRole('img', { name: 'HTTP 404 を表す猫の写真' });
	await expect(image).toHaveAttribute('src', 'https://http.cat/404.jpg');
	await expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
	await expect(page.getByRole('link', { name: 'http.cat' })).toHaveAttribute('target', '_blank');
	await expect(page.getByRole('link', { name: 'トップページへ戻る' })).toHaveAttribute('href', '/');
});

test('http.cat の画像を読めなくても、エラーの画面は出す', async ({ page }) => {
	await page.route('https://http.cat/**', (route) => route.abort());
	await page.goto('/no-such-page');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('ページが見つかりません');
	await expect(page.getByRole('img', { name: 'HTTP 404 を表す猫の写真' })).toHaveCount(0);
});

test('フッターに版とクライアントの情報を出し、まとめてコピーできる', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto('/');
	const footer = page.locator('footer');
	// E2E のサーバーは build-info.json のないビルドなので、開発版と出る
	await expect(footer).toContainText('Funmary 開発版');
	await expect(footer).toContainText('ブラウザ');
	await footer.getByRole('button', { name: '情報をコピー' }).click();
	await expect(footer.getByRole('button', { name: 'コピーしました' })).toBeVisible();
	const copied = await page.evaluate(() => navigator.clipboard.readText());
	// OS によって、クリップボードの改行が \r\n になる
	expect(copied).toMatch(/^Funmary 開発版\r?\nクライアント .+、ブラウザ$/);
	// 「コピーしました」のままにしない。しばらくしたら、元の文言に戻る
	await expect(footer.getByRole('button', { name: '情報をコピー' })).toBeVisible();
});

test('機械向けの口 (Hono) のエラーも、ブラウザで開けば猫の付いた画面を出す', async ({
	page,
	request,
}) => {
	await page.route('https://http.cat/**', (route) =>
		route.fulfill({ contentType: 'image/png', body: PIXEL }),
	);
	const response = await page.goto('/cal/no-such-token.ics');
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('ページが見つかりません');
	await expect(page.getByRole('img', { name: 'HTTP 404 を表す猫の写真' })).toHaveAttribute(
		'src',
		'https://http.cat/404.jpg',
	);
	// カレンダーアプリなど、HTML を求めないものには、文字だけを返す
	const plain = await request.get('/cal/no-such-token.ics', { headers: { Accept: '*/*' } });
	expect(plain.status()).toBe(404);
	expect(await plain.text()).toBe('Not Found');
});

test('/favicon.ico は、ICO の形式で返る (ファビコンを集めるサービスが探す)', async ({
	request,
}) => {
	const res = await request.get('/favicon.ico');
	expect(res.status()).toBe(200);
	expect(res.headers()['content-type']).toBe('image/x-icon');
	const body = await res.body();
	// ICO の先頭: 予約 0、種別 1 (アイコン)、画像 1 枚
	expect([...body.subarray(0, 6)]).toEqual([0, 0, 1, 0, 1, 0]);
});

test('だれでも登録できるときは、?code= があっても、招待コードの欄を出さない', async ({ page }) => {
	await page.goto('/?code=abcdef');
	await expect(page.getByLabel('はじめての方は、招待コードで登録します')).toHaveCount(0);
	// 招待コードが URL にあるのは、招待制のときだけの使い方。参照元の制限も付けない
	await expect(page.locator('meta[name="referrer"]')).toHaveCount(0);
});
