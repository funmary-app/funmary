// 時間割の取り込みと、履修科目の登録。
import { expect, test, type Page } from '@playwright/test';
import { oidc, signIn, useMockOidc, seedSubjects, signInAs, answerConfirm } from './support.ts';

useMockOidc();

test.describe('ポータルの時間割の取り込み', () => {
	const loginAs = async (page: Page) => {
		await oidc.setIdentity({
			sub: 'e2e-import',
			email: 'import@fun.ac.jp',
			email_verified: true,
			hd: 'fun.ac.jp',
		});
		await signIn(page);
		await expect(page).toHaveURL('/app');
	};

	test('ログインしていなければ、ログインの画面に移る', async ({ page }) => {
		await page.goto('/app/courses/import');
		await expect(page).toHaveURL('/login');
	});

	test('使い方と、自動では取れないため利用者どうしで登録している旨、ブックマークレットを出す', async ({
		page,
	}) => {
		await loginAs(page);
		await page.goto('/app/courses/import');
		await expect(page.getByText('大学から自動では取得できません')).toBeVisible();
		const link = page.getByRole('link', { name: 'Funmary に時間割を取り込む' });
		await expect(link).toHaveAttribute('href', /^javascript:/);
	});

	test('# 以降の内容は、ボタンを押したときだけ送り、結果を出す。URL からは内容を消す', async ({
		page,
	}) => {
		await loginAs(page);
		const payload = Buffer.from(
			JSON.stringify({
				v: 1,
				c: [
					{
						l: '999999',
						y: 2026,
						t: '20',
						w: 1,
						p: 1,
						r: '595',
						s: '',
						n: '架空の科目',
						h: '',
						x: '',
					},
				],
			}),
		).toString('base64url');
		await page.goto(`/app/courses/import#${payload}`);
		await expect(page.getByRole('button', { name: '取り込む' })).toBeVisible();
		expect(new URL(page.url()).hash).toBe('');
		await page.getByRole('button', { name: '取り込む' }).click();
		await expect(page.getByText('読み取ったコマ: 1 件')).toBeVisible();
		// まだシラバスを取り込んでいない科目は、登録しない
		await expect(page.getByText('まだ Funmary に取り込まれていない科目: 1 件')).toBeVisible();
	});

	test('壊れた内容は、取り込まずに理由を出す', async ({ page }) => {
		await loginAs(page);
		await page.goto('/app/courses/import#AAAA');
		await page.getByRole('button', { name: '取り込む' }).click();
		await expect(page.getByRole('alert')).toContainText('内容を読めませんでした');
	});

	test('前の URL (/courses/import) で開いても、# 以降を残したまま /app の下へ転送する', async ({
		page,
	}) => {
		// 登録済みのブックマークレットは、前の URL を開く
		await loginAs(page);
		await page.goto('/courses/import#AAAA');
		await expect(page).toHaveURL('/app/courses/import');
		await page.getByRole('button', { name: '取り込む' }).click();
		await expect(page.getByRole('alert')).toContainText('内容を読めませんでした');
	});
});

// Google の代わりのサーバーを 1 つのポートで立てるので、ログインが要る画面のテストもこのファイルに置く
test.describe('履修科目の登録', () => {
	// 手元では DB がテストのたびに消えないので、利用者を毎回変えて、前回の登録を持ち越さない
	const sub = `e2e-courses-${Date.now()}`;

	test.beforeAll(() => {
		seedSubjects((database, exerciseId) => {
			// 前回の実行で足した枠を消し、休講を 1 件入れておく (科目との照合は、済んだものとして入れる)
			database.sqlite.prepare('DELETE FROM timetable_slots WHERE subject_id = ?').run(exerciseId);
			database.sqlite
				.prepare(
					`INSERT OR IGNORE INTO class_changes
						(kind, subject_id, lesson_name, date, period, makeup_plan, first_seen_at, last_seen_at)
						VALUES ('cancellation', ?, '架空の演習Ⅱ1-AB', '2026-10-06', 3, 'planned', 0, 0)`,
				)
				.run(exerciseId);
		});
	});

	const loginAs = (page: Page) => signInAs(page, `${sub}@fun.ac.jp`);

	test('ログインしていなければ、ログインの画面に移る', async ({ page }) => {
		await page.goto('/app/courses');
		await expect(page).toHaveURL('/login');
	});

	test('科目を探して登録し、曜日と時限を足し、登録を取り消せる', async ({ page }) => {
		await loginAs(page);
		await page
			.getByRole('navigation', { name: 'メニュー' })
			.getByRole('link', { name: '科目', exact: true })
			.first()
			.click();
		await expect(page.getByText('まだ登録していません')).toBeVisible();

		// 「科目を探す」はタブで切り替える。開いたタブは URL に残り、読み込み直しても保たれる
		await page.getByRole('tab', { name: '科目を探す' }).click();
		await expect(page).toHaveURL(/tab=search/);
		// ローマ数字を II と打っても見つかる
		await page.getByRole('searchbox').fill('架空の演習II');
		await page.getByRole('button', { name: '探す' }).click();
		const found = page.getByRole('tabpanel', { name: '科目を探す' }).getByRole('listitem');
		await expect(found).toHaveCount(1);
		await expect(found).toContainText('後期、架空 一郎');
		await found.getByRole('button', { name: '登録する' }).click();
		await expect(page.getByRole('status')).toHaveText('架空の演習Ⅱ1-AB を履修科目に登録しました。');

		await page.getByRole('tab', { name: '登録した科目' }).click();
		const registered = page
			.getByRole('tabpanel', { name: '登録した科目' })
			.getByRole('listitem')
			.filter({ hasText: '架空の演習Ⅱ1-AB' });
		await expect(registered).toContainText('曜日と時限が、まだ登録されていません');

		await registered.getByText('曜日と時限を登録する', { exact: true }).click();
		const addSlot = registered.locator('details[open]');
		await addSlot.getByLabel('曜日').selectOption('火曜');
		await addSlot.getByLabel('時限').selectOption('3 限');
		await addSlot.getByLabel('教室').fill(' 363 ');
		await addSlot.getByRole('button', { name: '登録する' }).click();
		await expect(page.getByRole('status')).toHaveText('曜日と時限を登録しました。');
		await expect(registered).toContainText('火曜 3 限、363');

		// 授業の詳細
		await registered.getByRole('link', { name: '架空の演習Ⅱ1-AB' }).click();
		// 授業の URL は、DB の ID でなく、年度とシラバスの番号で作る
		await expect(page).toHaveURL('/app/subjects/2026/900001');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('架空の演習Ⅱ1-AB');
		await expect(page.getByText('2026 年度 後期')).toBeVisible();
		await expect(page.getByText('火曜 3 限、363')).toBeVisible();
		const changes = page.getByRole('region', { name: '休講、補講、教室変更' });
		await expect(changes).toContainText('休講 2026-10-06 3 限、補講あり');
		await expect(page.getByText('架空の演習の概要です。')).toBeVisible();
		const syllabusLink = page.getByRole('link', { name: 'シラバスの原文 (大学のサイト)' });
		await expect(syllabusLink).toHaveAttribute('href', 'https://syllabus.example.com/900001');
		// Funmary の外へのリンクは、新しいタブで開く
		await expect(syllabusLink).toHaveAttribute('target', '_blank');
		await expect(syllabusLink).toHaveAttribute('rel', 'noopener noreferrer');
		await page
			.getByRole('navigation', { name: 'メニュー' })
			.getByRole('link', { name: '科目', exact: true })
			.first()
			.click();

		await registered.getByRole('button', { name: '登録を取り消す' }).click();
		await answerConfirm(page, true);
		await expect(page.getByRole('status')).toHaveText('架空の演習Ⅱ1-AB の登録を取り消しました。');
		await expect(page.getByText('まだ登録していません')).toBeVisible();
	});

	test('シラバスにない授業を足して登録でき、足した人は直したり消したりできる', async ({
		page,
		browser,
	}) => {
		// E2E の DB は実行をまたいで残るので、実行ごとに別の名前にする
		const name = `E2E の課外講座${Date.now()}`;
		await loginAs(page);
		await page.goto('/app/courses');
		const create = page.getByRole('region', { name: 'シラバスにない授業を足す' });
		await create.getByText('公開シラバスに載っていない授業を、科目として足す').click();
		await create.getByLabel(/授業の名前/).fill(name);
		await create.getByLabel('学期').selectOption('後期');
		await create.getByRole('button', { name: '足して登録する' }).click();
		await expect(page.getByRole('status')).toContainText(
			`${name} を足して、履修科目に登録しました`,
		);
		const registered = page
			.getByRole('tabpanel', { name: '登録した科目' })
			.getByRole('listitem')
			.filter({ hasText: name });
		await expect(registered).toContainText('シラバスにない授業');

		// 同じ名前 (全角と半角の違いを除く) は足さない
		await create.getByLabel(/授業の名前/).fill(name.replace('E2E', 'Ｅ２Ｅ'));
		await create.getByRole('button', { name: '足して登録する' }).click();
		await expect(page.getByRole('alert')).toContainText(`同じ名前の科目「${name}」があります`);

		// ほかの利用者は探して登録できるが、直せない
		const other = await (await browser.newContext()).newPage();
		const otherEmail = `e2e-other-${Date.now()}@fun.ac.jp`;
		await oidc.setIdentity({
			sub: otherEmail,
			email: otherEmail,
			email_verified: true,
			hd: 'fun.ac.jp',
		});
		await signIn(other);
		await other.goto(`/app/courses?q=${encodeURIComponent(name)}`);
		await other.getByRole('link', { name }).click();
		await expect(other.getByText('公開シラバスにない授業です。')).toBeVisible();
		await expect(other.getByRole('region', { name: 'この授業を直す' })).toHaveCount(0);

		// 直せなくても、履修登録していなくても、曜日と時限は足せる
		await other.getByText('曜日と時限を足す', { exact: true }).click();
		const addSlot = other.locator('details[open]');
		await addSlot.getByLabel('曜日').selectOption('水曜');
		await addSlot.getByLabel('時限').selectOption('2 限');
		await addSlot.getByRole('button', { name: '登録する' }).click();
		await expect(other.getByRole('status')).toHaveText('曜日と時限を登録しました。');
		await expect(other.getByText('水曜 2 限')).toBeVisible();

		// 足した人は直せる
		await registered.getByRole('link', { name }).click();
		const edit = page.getByRole('region', { name: 'この授業を直す' });
		await edit.getByLabel('教員 (任意)').fill('未来 花子');
		await edit.getByRole('button', { name: '直す' }).click();
		await expect(page.getByRole('status')).toHaveText('授業を直しました。');
		await expect(page.getByText('未来 花子')).toBeVisible();

		// 消すときは、確かめたことのチェックが要る
		await edit.getByText('この授業を消す').click();
		await edit.getByLabel(/元に戻せないことを確かめました/).check();
		await edit.getByRole('button', { name: '消す' }).click();
		await expect(page).toHaveURL('/app/courses');
		await expect(page.getByRole('link', { name })).toHaveCount(0);
	});

	test('シラバスにない授業の公開範囲を変えられる。非公開は足した人と管理者だけ、限定公開は URL を知っていれば見られる', async ({
		page,
		browser,
	}) => {
		const name = `E2E の公開範囲演習${Date.now()}`;
		await loginAs(page);
		await page.goto('/app/courses');
		const create = page.getByRole('region', { name: 'シラバスにない授業を足す' });
		await create.getByText('公開シラバスに載っていない授業を、科目として足す').click();
		await create.getByLabel(/授業の名前/).fill(name);
		await create.getByLabel('学期').selectOption('後期');
		await create.getByRole('button', { name: '足して登録する' }).click();
		await expect(page.getByRole('status')).toContainText(`${name} を足して`);

		const registered = page
			.getByRole('tabpanel', { name: '登録した科目' })
			.getByRole('listitem')
			.filter({ hasText: name });
		await registered.getByRole('link', { name }).click();
		const visibility = page.getByRole('group', { name: '公開範囲' });
		await expect(visibility).toBeVisible();
		const subjectUrl = page.url();

		const other = await (await browser.newContext()).newPage();
		const otherEmail = `e2e-visibility-${Date.now()}@fun.ac.jp`;
		await oidc.setIdentity({
			sub: otherEmail,
			email: otherEmail,
			email_verified: true,
			hd: 'fun.ac.jp',
		});
		await signIn(other);

		// 既定 (全体公開) では、ほかの利用者も探して見つけられる
		await other.goto(`/app/courses?q=${encodeURIComponent(name)}`);
		await expect(other.getByRole('link', { name })).toBeVisible();

		// 非公開にすると、ほかの利用者は探しても見つからず、直接開いても見つからないと出る
		await visibility.getByLabel(/非公開/).check();
		await page.getByRole('button', { name: '公開範囲を変える' }).click();
		await expect(page.getByRole('status')).toHaveText('公開範囲を 非公開 に変えました。');
		await other.goto(`/app/courses?q=${encodeURIComponent(name)}`);
		await expect(other.getByRole('link', { name })).toHaveCount(0);
		expect((await other.goto(subjectUrl))?.status()).toBe(404);

		// 限定公開にすると、探しては見つからないが、URL を知っていれば直接開ける
		await page.goto(subjectUrl);
		await visibility.getByLabel(/限定公開/).check();
		await page.getByRole('button', { name: '公開範囲を変える' }).click();
		await expect(page.getByRole('status')).toHaveText('公開範囲を 限定公開 に変えました。');
		await other.goto(`/app/courses?q=${encodeURIComponent(name)}`);
		await expect(other.getByRole('link', { name })).toHaveCount(0);
		expect((await other.goto(subjectUrl))?.status()).toBe(200);
	});

	test('ない科目の詳細は、見つからないと出す', async ({ page }) => {
		await loginAs(page);
		// 授業の URL は /app/subjects/<年度>/<シラバスの番号>。前の形 (DB の ID) は転送しない
		for (const path of ['2026/999999', '26/900001', '2026/..%2Fx', '1']) {
			const response = await page.goto(`/app/subjects/${path}`);
			expect(response?.status()).toBe(404);
		}
	});
});
