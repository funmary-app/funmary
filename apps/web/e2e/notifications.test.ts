// 通知欄、カレンダーと RSS の購読、Webhook。
import { expect, test } from '@playwright/test';
import { oidc, signIn, useMockOidc, seedSubjects, answerConfirm } from './support.ts';

// サーバーの状態 (次にログインする人) を共有するので、テストは 1 つずつ動かす
test.describe.configure({ mode: 'serial' });
useMockOidc();

test.describe('通知欄', () => {
	// 手元では DB が残るので、利用者と休講の授業名を毎回変える
	const stamp = Date.now();
	const email = `e2e-notify-${stamp}@fun.ac.jp`;
	const lessonName = `架空の演習 (通知 ${stamp})`;

	test('履修している科目の休講が通知欄に入り、ベルに未読数が出る。開くと授業の画面へ移り、既読になる', async ({
		page,
	}) => {
		oidc.setIdentity({ sub: email, email, email_verified: true, hd: 'fun.ac.jp' });
		await signIn(page);
		await page.goto('/app');
		await expect(page.getByRole('link', { name: '通知', exact: true }).first()).toBeVisible();

		// 履修を入れてから、そのあとに見つけた休講を入れる。
		// 履修の前に、ほかのテストや前の試行が同じ科目に入れた休講を拾わないよう、休講の時刻を履修より後ろにする
		seedSubjects((database, exerciseId) => {
			const user = database.sqlite.prepare('SELECT id FROM users WHERE email = ?').get(email) as {
				id: string;
			};
			const now = Date.now();
			database.sqlite
				.prepare(
					'INSERT INTO course_registrations (user_id, subject_id, created_at) VALUES (?, ?, ?)',
				)
				.run(user.id, exerciseId, now);
			database.sqlite
				.prepare(
					`INSERT INTO class_changes (kind, subject_id, lesson_name, date, period, first_seen_at, last_seen_at)
						VALUES ('cancellation', ?, ?, '2030-01-07', 2, ?, ?)`,
				)
				.run(exerciseId, lessonName, now + 1_000, now + 1_000);
		});

		// 管理者が、休講などを通知欄に入れる定期処理を今すぐ動かす
		const admin = 'e2e-admin@fun.ac.jp';
		oidc.setIdentity({ sub: admin, email: admin, email_verified: true, hd: 'fun.ac.jp' });
		await signIn(page);
		await page.goto('/app/admin/status');
		await page
			.getByRole('region', { name: '今すぐ動かす' })
			.getByRole('listitem')
			.filter({ hasText: '休講などの通知欄への記録' })
			.getByRole('button', { name: '動かす' })
			.click();
		await expect(page.getByRole('status').first()).toContainText('休講などの通知を');

		oidc.setIdentity({ sub: email, email, email_verified: true, hd: 'fun.ac.jp' });
		await signIn(page);
		await page.goto('/app');
		await page.getByRole('link', { name: '通知 (未読 1 件)' }).first().click();
		await expect(page.getByRole('heading', { level: 1, name: '通知' })).toBeVisible();
		const item = page.getByRole('button', { name: /\[休講\] 架空の演習Ⅱ1-AB \(1\/7 2 限\)/ });
		await expect(item).toContainText('未読');

		await item.click();
		await expect(page).toHaveURL(/\/app\/subjects\/2026\/900001$/);
		await page.goto('/app/notifications');
		await expect(item).not.toContainText('未読');
		await expect(page.getByRole('link', { name: '通知', exact: true }).first()).toBeVisible();
		const markAllRead = page.getByRole('button', { name: 'すべて既読にする' });
		await expect(markAllRead).toBeDisabled();
		await expect(markAllRead).toHaveCSS('color', 'rgb(102, 102, 102)');
		await expect(markAllRead).toHaveCSS('background-color', 'rgb(243, 242, 242)');
		await expect(markAllRead).toHaveCSS('border-top-color', 'rgb(140, 134, 134)');
		await page.emulateMedia({ colorScheme: 'dark' });
		await expect(markAllRead).toHaveCSS('color', 'rgb(179, 171, 171)');
		await expect(markAllRead).toHaveCSS('background-color', 'rgb(38, 34, 34)');
		await expect(markAllRead).toHaveCSS('border-top-color', 'rgb(125, 118, 118)');

		// 種類で絞り込む
		await page
			.getByRole('navigation', { name: '種類で絞り込む' })
			.getByRole('link', { name: '補講' })
			.click();
		await expect(page.getByText('通知はまだありません。')).toBeVisible();
	});
});

test.describe('カレンダーの購読', () => {
	// E2E の DB は実行をまたいで残るので、実行ごとに別の人にする
	const email = `e2e-calendar-${Date.now()}@fun.ac.jp`;

	test('購読の URL を発行して ICS を取れ、再発行と無効化で前の URL が使えなくなる', async ({
		page,
	}) => {
		oidc.setIdentity({ sub: email, email, email_verified: true, hd: 'fun.ac.jp' });
		await signIn(page);
		await page
			.getByRole('navigation', { name: 'メニュー' })
			.getByRole('link', { name: '設定', exact: true })
			.first()
			.click();
		await page.getByRole('link', { name: /カレンダーの購読/ }).click();

		// パンくずで、いまの場所と設定への戻り方が分かる
		const breadcrumb = page.getByRole('navigation', { name: 'パンくず' });
		await expect(breadcrumb.getByRole('listitem')).toHaveText(['設定', 'カレンダーの購読']);
		await expect(breadcrumb.getByText('カレンダーの購読')).toHaveAttribute('aria-current', 'page');
		await breadcrumb.getByRole('link', { name: '設定' }).click();
		await expect(page).toHaveURL('/app/settings');
		await page.getByRole('link', { name: /カレンダーの購読/ }).click();

		await page.getByRole('button', { name: '購読の URL を発行する' }).click();

		const url = page.getByLabel('購読の URL', { exact: true });
		await expect(url).toHaveValue(/\/cal\/[\w-]{43}\.ics$/);
		const first = await url.inputValue();
		await expect(page.getByRole('img', { name: '購読の URL の QR コード' })).toBeVisible();
		const google = page.getByRole('link', { name: 'Google カレンダーに追加' });
		await expect(google).toHaveAttribute('href', /^https:\/\/calendar\.google\.com\//);
		await expect(google).toHaveAttribute('target', '_blank');
		await expect(google).toHaveAttribute('rel', 'noopener noreferrer');

		const ics = await page.request.get(first);
		expect(ics.status()).toBe(200);
		expect(ics.headers()['content-type']).toBe('text/calendar; charset=utf-8');
		expect(ics.headers()['x-robots-tag']).toBe('noindex');
		expect(await ics.text()).toContain('BEGIN:VCALENDAR');

		// 開き直すと URL はもう出ず、取りに来た日時が出る
		await page.reload();
		await expect(page.getByLabel('購読の URL', { exact: true })).toHaveCount(0);
		await expect(page.getByText('まだ取りに来ていません')).toHaveCount(0);

		await page.getByRole('button', { name: '再発行する' }).click();
		await expect(page.getByLabel('購読の URL', { exact: true })).not.toHaveValue(first);
		const second = await page.getByLabel('購読の URL', { exact: true }).inputValue();
		expect((await page.request.get(first)).status()).toBe(404);
		expect((await page.request.get(second)).status()).toBe(200);

		await page.getByRole('button', { name: '無効にする' }).click();
		await answerConfirm(page, true);
		await expect(page.getByRole('status').first()).toHaveText(/購読の URL を無効にしました/);
		expect((await page.request.get(second)).status()).toBe(404);
		await expect(page.getByRole('button', { name: '購読の URL を発行する' })).toBeVisible();
	});
});

test.describe('お知らせのフィード', () => {
	// E2E の DB は実行をまたいで残るので、実行ごとに別の人にする
	const email = `e2e-feed-${Date.now()}@fun.ac.jp`;

	test('購読の URL を発行して RSS、Atom、JSON Feed を取れ、載せる種類を絞れる', async ({
		page,
	}) => {
		oidc.setIdentity({ sub: email, email, email_verified: true, hd: 'fun.ac.jp' });
		await signIn(page);
		await page.goto('/app/settings/feed');

		await page.getByRole('button', { name: '購読の URL を発行する' }).click();
		const rss = await page.getByLabel('RSS (RSS 2.0)').inputValue();
		const atom = await page.getByLabel('Atom (Atom 1.0)').inputValue();
		const json = await page.getByLabel('JSON Feed (JSON Feed 1.1)').inputValue();
		expect(rss).toMatch(/\/feed\/[\w-]{43}\/rss\.xml$/);
		expect(atom).toMatch(/\/feed\/[\w-]{43}\/atom\.xml$/);
		expect(json).toMatch(/\/feed\/[\w-]{43}\/feed\.json$/);

		const rssResponse = await page.request.get(rss);
		expect(rssResponse.status()).toBe(200);
		expect(rssResponse.headers()['content-type']).toContain('xml');
		expect(rssResponse.headers()['x-robots-tag']).toBe('noindex');
		expect(await rssResponse.text()).toContain('<rss');
		expect((await page.request.get(atom)).status()).toBe(200);
		expect((await page.request.get(json)).status()).toBe(200);

		// 開き直すと URL はもう出ず、載せる種類の設定が出る
		await page.reload();
		await expect(page.getByLabel('RSS (RSS 2.0)')).toHaveCount(0);
		await page.getByLabel('補講').uncheck();
		await page.getByRole('button', { name: '保存する' }).click();
		await expect(page.getByRole('status').first()).toHaveText(/載せる通知の種類を保存しました/);
		await page.reload();
		await expect(page.getByLabel('補講')).not.toBeChecked();
		await expect(page.getByLabel('休講')).toBeChecked();

		await page.getByRole('button', { name: '無効にする' }).click();
		await answerConfirm(page, true);
		await expect(page.getByRole('status').first()).toHaveText(/購読の URL を無効にしました/);
		expect((await page.request.get(rss)).status()).toBe(404);
		await expect(page.getByRole('button', { name: '購読の URL を発行する' })).toBeVisible();
	});
});

test.describe('Webhook', () => {
	const stamp = Date.now();
	const email = `e2e-webhook-${stamp}@fun.ac.jp`;
	const webhookUrl = `https://discord.com/api/webhooks/123456/e2e-token-${stamp}`;

	test('Discord の Webhook の登録、保存、無効化、削除ができる。URL は末尾を伏せて出す', async ({
		page,
	}) => {
		oidc.setIdentity({ sub: email, email, email_verified: true, hd: 'fun.ac.jp' });
		await signIn(page);
		await page.goto('/app/settings');
		await page.getByRole('link', { name: 'Webhook' }).first().click();
		await expect(page.getByRole('heading', { level: 1, name: 'Webhook' })).toBeVisible();

		// Discord の Webhook でない URL は、登録できない
		await page.getByLabel('Webhook の URL').fill('https://example.com/hook');
		await page.getByRole('button', { name: '登録して、テスト通知を送る' }).click();
		await expect(page.getByRole('alert')).toContainText('Discord の Webhook の URL');

		await page.getByLabel('Webhook の URL').fill(webhookUrl);
		await page.getByLabel('名前 (任意)').first().fill('友人と共有');
		await page.getByRole('button', { name: '登録して、テスト通知を送る' }).click();
		await expect(page.getByRole('status')).toContainText('Webhook を登録しました');
		const item = page.getByRole('listitem').filter({ hasText: '友人と共有' });
		await expect(item).toContainText('https://discord.com/api/webhooks/123456/…');
		await expect(page.getByText(`e2e-token-${stamp}`)).toHaveCount(0);

		// 同じ Webhook は、二重に登録できない
		await page.getByLabel('Webhook の URL').fill(webhookUrl);
		await page.getByRole('button', { name: '登録して、テスト通知を送る' }).click();
		await expect(page.getByRole('alert')).toContainText('すでに登録しています');

		// 届ける通知の種類を変えて保存する。開き直しても残る
		await item.getByLabel('補講').uncheck();
		await item.getByRole('button', { name: '保存する' }).click();
		await expect(page.getByRole('status')).toHaveText('保存しました。');
		await page.reload();
		await expect(item.getByLabel('補講')).not.toBeChecked();
		await expect(item.getByLabel('休講')).toBeChecked();

		await item.getByRole('button', { name: '無効にする' }).click();
		await expect(item).toContainText('無効');
		await expect(item.getByRole('button', { name: 'テスト通知を送る' })).toBeDisabled();
		await item.getByRole('button', { name: '有効に戻す' }).click();
		await expect(item.getByRole('button', { name: 'テスト通知を送る' })).toBeEnabled();

		await item.getByRole('button', { name: '削除する' }).click();
		await answerConfirm(page, true);
		await expect(item).toHaveCount(0);
	});

	test('汎用の Webhook は、登録すると署名の鍵が出る。作り直すと新しい鍵が出る', async ({
		page,
	}) => {
		const genericEmail = `e2e-webhook-generic-${Date.now()}@fun.ac.jp`;
		oidc.setIdentity({
			sub: genericEmail,
			email: genericEmail,
			email_verified: true,
			hd: 'fun.ac.jp',
		});
		await signIn(page);
		await page.goto('/app/settings/webhooks');

		await page.getByLabel('汎用の Webhook (自分で用意した URL)').check();
		await page.getByLabel('Webhook の URL').fill('https://example.com/hook');
		await page.getByLabel('名前 (任意)').first().fill('自作のスクリプト');
		await page.getByRole('button', { name: '登録して、テスト通知を送る' }).click();
		await expect(page.getByText('Webhook を登録しました', { exact: false })).toBeVisible();
		const firstKey = await page.locator('.key-box code').first().textContent();
		expect(firstKey).toMatch(/^whsec_/);

		const item = page.getByRole('listitem').filter({ hasText: '自作のスクリプト' });
		await expect(item).toContainText('汎用');

		// 確認でキャンセルすると、鍵は作り直さない
		await item.getByRole('button', { name: '署名の鍵を作り直す' }).click();
		await answerConfirm(page, false);
		await page.waitForLoadState('networkidle');
		await expect(page.getByText('作り直しました', { exact: false })).toHaveCount(0);
		await expect(page.locator('.key-box code').first()).toHaveText(firstKey ?? '');

		await item.getByRole('button', { name: '署名の鍵を作り直す' }).click();
		await answerConfirm(page, true);
		await expect(page.getByText('作り直しました', { exact: false })).toBeVisible();
		const secondKey = await page.locator('.key-box code').first().textContent();
		expect(secondKey).toMatch(/^whsec_/);
		expect(secondKey).not.toBe(firstKey);
	});

	test('管理者が上限を 0 にすると、新しく登録できない。戻すと登録できる', async ({ page }) => {
		const admin = 'e2e-admin@fun.ac.jp';
		oidc.setIdentity({ sub: admin, email: admin, email_verified: true, hd: 'fun.ac.jp' });
		await signIn(page);
		// 画面が動き出す前に入れた値は、動き出したときに元に戻ることがある。保存の結果で確かめ、戻っていたらやり直す
		await expect(async () => {
			await page.goto('/app/admin/webhooks');
			await page.getByLabel(/1 人あたりの上限/).fill('0');
			await page.getByRole('button', { name: '保存する' }).click();
			await expect(page.getByRole('status')).toHaveText('上限を 0 個にしました。', {
				timeout: 3000,
			});
		}).toPass();

		await page.goto('/app/settings/webhooks');
		await expect(page.getByText('上限に達しています')).toBeVisible();
		await expect(page.getByRole('button', { name: '登録して、テスト通知を送る' })).toHaveCount(0);

		await expect(async () => {
			await page.goto('/app/admin/webhooks');
			await page.getByLabel(/1 人あたりの上限/).fill('5');
			await page.getByRole('button', { name: '保存する' }).click();
			await expect(page.getByRole('status')).toHaveText('上限を 5 個にしました。', {
				timeout: 3000,
			});
		}).toPass();
	});
});
