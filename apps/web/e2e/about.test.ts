// このアプリについての画面。
import { expect, test, type Page } from '@playwright/test';
import { REPOSITORY_URL } from '../src/lib/repository.ts';
import { useMockOidc, signInAs, answerConfirm } from './support.ts';

// サーバーの状態 (次にログインする人) を共有するので、テストは 1 つずつ動かす
test.describe.configure({ mode: 'serial' });
useMockOidc();

test.describe('このアプリについて', () => {
	const loginAs = (page: Page) => signInAs(page, `e2e-about-${Date.now()}@fun.ac.jp`);

	test('設定の「アカウント」のすぐ上に、6 つの項目が並ぶ', async ({ page }) => {
		await loginAs(page);
		await page.goto('/app/settings');

		const headings = page.getByRole('heading', { level: 2 });
		const titles = await headings.allTextContents();
		const accountIndex = titles.indexOf('アカウント');
		expect(titles[accountIndex - 1]).toBe('このアプリについて');

		const section = page.locator('section', {
			has: page.getByRole('heading', { name: 'このアプリについて' }),
		});
		for (const path of [
			'/about',
			'/license',
			'/third-party-licenses',
			'/terms',
			'/privacy',
			'/contributors',
		]) {
			await expect(section.locator(`a[href="${path}"]`)).toBeVisible();
		}
	});

	test('リポジトリと作者の画面に、GitHub とコントリビューターへのリンクが出る', async ({
		page,
	}) => {
		await loginAs(page);
		await page.goto('/about');

		const repo = page.locator(`a[href="${REPOSITORY_URL}"]`).first();
		await expect(repo).toHaveAttribute('target', '_blank');
		await expect(repo).toHaveAttribute('rel', 'noopener noreferrer');

		// Contributors の画面は GitHub から取得するので、ここでは開かない
		await expect(
			page.getByRole('link', { name: 'コードを書いてくれた人たち', exact: true }),
		).toHaveAttribute('href', '/contributors');
		await expect(page.getByRole('link', { name: '設定', exact: true })).toHaveAttribute(
			'href',
			'/app/settings',
		);
	});

	test('ライセンスの画面に、BSD-3-Clause と Apache-2.0、ロゴとアイコンの利用条件の本文が出る', async ({
		page,
	}) => {
		await loginAs(page);
		await page.goto('/license');
		const license = (name: string) =>
			page.locator('details').filter({ has: page.getByText(name, { exact: true }) });

		await page.getByText('BSD-3-Clause', { exact: true }).click();
		await expect(license('BSD-3-Clause').getByText('Redistribution and use')).toBeVisible();

		await page.getByText('Apache-2.0', { exact: true }).click();
		await expect(license('Apache-2.0').getByText('Apache License')).toBeVisible();

		await page.getByText('ロゴとアイコンの利用条件', { exact: true }).click();
		await expect(
			license('ロゴとアイコンの利用条件').getByText('許可なくしてはいけないこと'),
		).toBeVisible();
	});

	test('サードパーティライセンスの画面に、依存の一覧が出る', async ({ page }) => {
		await loginAs(page);
		await page.goto('/third-party-licenses');

		await expect(
			page.getByText('Funmary が使っているオープンソースのソフトウェアのライセンスです。'),
		).toBeVisible();
	});

	test('このアプリについての画面は、ログインしていなくても開け、パンくずはトップに戻る', async ({
		page,
	}) => {
		await page.goto('/');
		await page.getByRole('link', { name: 'このアプリについて' }).click();
		await expect(page).toHaveURL('/about');
		await expect(page.getByRole('heading', { name: 'リポジトリと作者', level: 1 })).toBeVisible();
		await expect(page.getByRole('link', { name: 'トップ', exact: true })).toHaveAttribute(
			'href',
			'/',
		);

		await page.getByRole('link', { name: 'ライセンス', exact: true }).click();
		await expect(page).toHaveURL('/license');
		await expect(page.getByRole('heading', { name: 'ライセンス', level: 1 })).toBeVisible();

		await page.goto('/third-party-licenses');
		await expect(
			page.getByRole('heading', { name: 'サードパーティライセンス', level: 1 }),
		).toBeVisible();

		await page.goto('/terms');
		await expect(page.getByRole('heading', { name: '利用規約', level: 1 })).toBeVisible();

		await page.goto('/privacy');
		await expect(
			page.getByRole('heading', { name: 'プライバシーポリシー', level: 1 }),
		).toBeVisible();
	});

	test('設定の下にあった前の URL は、ルートの下の URL に転送する', async ({ request }) => {
		for (const name of ['about', 'license', 'third-party-licenses', 'contributors']) {
			const response = await request.get(`/app/settings/${name}`, { maxRedirects: 0 });
			expect(response.status()).toBe(308);
			expect(response.headers()['location']).toBe(`/${name}`);
		}
	});

	// E2E のサーバーは DISCORD_CLIENT_ID/SECRET を設定していないので、常にこの状態になる (#163)
	test('Discord 連携の OAuth が設定されていなければ、設定に入口を出さず、直接開いても使えないと出す', async ({
		page,
	}) => {
		await loginAs(page);
		await page.goto('/app/settings');
		await expect(page.getByRole('link', { name: 'Discord連携' })).toHaveCount(0);

		await page.goto('/app/settings/discord');
		await expect(page.getByRole('heading', { name: 'Discord連携', level: 1 })).toBeVisible();
		await expect(page.getByText('いまは Discord 連携を使えません。')).toBeVisible();
	});
});

test.describe('アカウントの管理', () => {
	test('データを書き出せ、メールアドレスを確かめて退会できる。退会のあとは、同じアカウントで登録し直せる', async ({
		page,
	}) => {
		const email = `e2e-leave-${Date.now()}@fun.ac.jp`;
		await signInAs(page, email);
		await page.goto('/app/settings');
		await page.getByRole('link', { name: /データの書き出しと退会/ }).click();

		const download = page.waitForEvent('download');
		await page.getByRole('link', { name: 'JSON をダウンロード' }).click();
		const file = await download;
		expect(file.suggestedFilename()).toMatch(/^funmary-data-\d{4}-\d{2}-\d{2}\.json$/);

		// メールアドレスが違えば、消さない
		await page.getByRole('textbox', { name: 'メールアドレス' }).fill('someone@fun.ac.jp');
		await page.getByRole('button', { name: '退会する' }).click();
		await answerConfirm(page, true);
		await expect(page.getByRole('alert')).toContainText('一致しません');

		// キャンセルすれば、消さない
		await page.getByRole('textbox', { name: 'メールアドレス' }).fill(email);
		await page.getByRole('button', { name: '退会する' }).click();
		await answerConfirm(page, false);
		await page.goto('/app');
		await expect(page).toHaveURL('/app');

		await page.goto('/app/settings/account');
		await page.getByRole('textbox', { name: 'メールアドレス' }).fill(email);
		await page.getByRole('button', { name: '退会する' }).click();
		await answerConfirm(page, true);
		await expect(page).toHaveURL('/');
		await page.goto('/app');
		await expect(page).toHaveURL('/login');

		// 同じアカウントで、初めてのログインとして登録し直せる (規約への同意からやり直す)
		await page.goto('/auth/google');
		await expect(page).toHaveURL(/\/consent/);
	});
});
