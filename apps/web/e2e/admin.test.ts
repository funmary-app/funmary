// 管理画面と、管理者、moderator が使う画面。
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openDatabase } from '@funmary/db';
import { E2E_DATA_DIR } from '../e2e-data-dir.ts';
import { oidc, signIn, useMockOidc, seedSubjects, signInAs, answerConfirm } from './support.ts';

useMockOidc();

test.describe('管理画面', () => {
	test.beforeAll(() => {
		seedSubjects((database) => {
			// 照合できなかった授業名と、その名前の休講を、紐付け前の状態に戻して入れる
			database.sqlite
				.prepare(
					`INSERT INTO unmatched_lessons (academic_year, lesson_name, first_seen_at, last_seen_at)
						VALUES (2026, '架空の演習Ⅱ (再)', 0, 0)
						ON CONFLICT DO UPDATE SET resolved_subject_id = NULL, ignored_at = NULL`,
				)
				.run();
			database.sqlite
				.prepare(
					`INSERT INTO class_changes (kind, lesson_name, date, period, first_seen_at, last_seen_at)
						VALUES ('cancellation', '架空の演習Ⅱ (再)', '2026-10-13', 2, 0, 0)
						ON CONFLICT DO UPDATE SET subject_id = NULL`,
				)
				.run();
		});
	});

	test('管理者でなければ、管理画面は見つからないことにする', async ({ page }) => {
		await signInAs(page, 'e2e-not-admin@fun.ac.jp');
		// 設定は全員が使える。管理の節は出ない
		await page
			.getByRole('navigation', { name: 'メニュー' })
			.getByRole('link', { name: '設定', exact: true })
			.click();
		await expect(page.getByRole('link', { name: /カレンダーの購読/ })).toBeVisible();
		await expect(page.getByRole('region', { name: '管理' })).toHaveCount(0);
		// 管理の画面は、それぞれの画面で管理者かを確かめるので、すべて開いて確かめる
		for (const path of [
			'/app/admin',
			'/app/admin/audit-log',
			'/app/admin/calendar',
			'/app/admin/campus-network',
			'/app/admin/discord',
			'/app/admin/invites',
			'/app/admin/lessons',
			'/app/admin/slot-review',
			'/app/admin/status',
			'/app/admin/support-invites',
			'/app/admin/test-accounts',
			'/app/admin/timetable',
			'/app/admin/webhooks',
		]) {
			expect((await page.goto(path))?.status(), path).toBe(404);
		}
	});

	test('シラバスにない授業の公開、情報の変更、削除が、操作の記録に残る', async ({ page }) => {
		await signInAs(page, 'e2e-admin@fun.ac.jp');
		const name = `E2E の監査ログ演習${Date.now()}`;
		await page.goto('/app/courses');
		await page.getByText('公開シラバスに載っていない授業を、科目として足す').click();
		await page.getByLabel(/授業の名前/).fill(name);
		await page.getByLabel('学期').selectOption('後期');
		await page.getByRole('button', { name: '足して登録する' }).click();
		await expect(page.getByRole('status')).toContainText(`${name} を足して`);

		await page.getByRole('link', { name }).click();
		const edit = page.getByRole('region', { name: 'この授業を直す' });
		await edit.getByLabel('教員 (任意)').fill('監査 太郎');
		await edit.getByRole('button', { name: '直す' }).click();
		await expect(page.getByRole('status')).toHaveText('授業を直しました。');
		await edit.getByText('この授業を消す').click();
		await edit.getByLabel(/元に戻せないことを確かめました/).check();
		await edit.getByRole('button', { name: '消す' }).click();
		await expect(page).toHaveURL('/app/courses');

		await page.goto('/app/admin/audit-log');
		const entries = page.getByRole('row');
		await expect(
			entries.filter({ hasText: `${name} を、シラバスにない授業として足した` }),
		).toHaveCount(1);
		await expect(entries.filter({ hasText: `${name} の情報を直した (${name})` })).toHaveCount(1);
		await expect(
			entries.filter({ hasText: `${name} を、シラバスにない授業として消した` }),
		).toHaveCount(1);
		await expect(entries.filter({ hasText: name }).first()).toContainText('e2e-admin@fun.ac.jp');
	});

	test('Discord設定の画面は、管理者にだけ開け、Bot が未設定なら設定のしかたを出す', async ({
		page,
	}) => {
		await signInAs(page, 'e2e-not-admin@fun.ac.jp');
		expect((await page.goto('/app/admin/discord'))?.status()).toBe(404);

		await signInAs(page, 'e2e-admin@fun.ac.jp');
		await page.goto('/app/settings');
		await page.getByRole('link', { name: /^Discord設定/ }).click();
		await expect(page.getByRole('heading', { name: 'Discord設定', level: 1 })).toBeVisible();
		await expect(page.getByText('Bot が設定されていません')).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'パンくず' })).toContainText('設定');
		// チャンネル 7 本とロール 3 つが、まだ決まっていない状態で並ぶ
		await expect(
			page.getByRole('region', { name: 'チャンネル' }).getByRole('listitem'),
		).toHaveCount(7);
		await expect(page.getByRole('region', { name: 'ロール' }).getByRole('listitem')).toHaveCount(3);
		// Bot がないときは、整えるボタンを出さない
		await expect(page.getByRole('button', { name: 'チャンネルとロールを整える' })).toHaveCount(0);
	});

	test('大学の公式の学年暦の PDF へのリンクを、設定に出す', async ({ page }) => {
		const pdf = 'https://www.fun.ac.jp/wp/wp-content/uploads/2026AcademicCalendar.pdf';
		seedSubjects((database) => {
			database.sqlite
				.prepare(
					`INSERT INTO settings (key, value, updated_at) VALUES ('official-academic-calendar-pdf', ?, 0)
						ON CONFLICT DO UPDATE SET value = excluded.value`,
				)
				.run(JSON.stringify({ year: 2026, url: pdf }));
		});
		await signInAs(page, 'e2e-not-admin@fun.ac.jp');
		await page.goto('/app/settings');
		const link = page
			.getByRole('region', { name: '大学の公式の資料' })
			.getByRole('link', { name: '2026 年度の学年暦 (PDF)' });
		await expect(link).toHaveAttribute('href', pdf);
		await expect(link).toHaveAttribute('target', '_blank');
		await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
	});

	test('照合できなかった授業名を、候補の科目に紐付けられる', async ({ page }) => {
		await signInAs(page, 'e2e-admin@fun.ac.jp');
		// 管理者には、設定の中に管理の節が出る。前の管理の入口は、そこへ転送する
		await page.goto('/app/admin');
		await expect(page).toHaveURL('/app/settings#admin');
		// 管理の節は、ふだん使う項目の邪魔にならないよう、アカウント (ログアウト) より下に出す
		const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
		expect(headings.indexOf('管理')).toBeGreaterThan(headings.indexOf('アカウント'));
		await page
			.getByRole('region', { name: '管理' })
			.getByRole('link', { name: /照合できなかった授業名/ })
			.click();

		const lesson = page.getByRole('listitem').filter({ hasText: '架空の演習Ⅱ (再)' });
		await lesson.getByRole('radio', { name: /架空の演習Ⅱ1-AB \(900001、後期\)/ }).check();
		await lesson.getByRole('button', { name: '紐付ける' }).click();
		await expect(page.getByRole('status')).toHaveText(
			'架空の演習Ⅱ (再) を 架空の演習Ⅱ1-AB に紐付けました (休講などの 1 件に科目を入れました)。',
		);
		await expect(page.getByRole('heading', { name: '架空の演習Ⅱ (再)' })).toHaveCount(0);

		// 紐付け済みの一覧に移る。紐付けを外すと、照合できなかった一覧に戻る
		const resolved = page.getByRole('region', { name: '紐付け済み' });
		await expect(resolved).toContainText('架空の演習Ⅱ (再)');
		await expect(resolved.getByRole('link', { name: '架空の演習Ⅱ1-AB' })).toBeVisible();
		await resolved.getByRole('button', { name: '紐付けを外す' }).click();
		await expect(page.getByRole('status')).toHaveText(
			'架空の演習Ⅱ (再) の紐付けを外しました (休講などの 1 件から科目を外しました)。',
		);
		await expect(page.getByRole('heading', { name: '架空の演習Ⅱ (再)' })).toBeVisible();
		await expect(page.getByRole('region', { name: '紐付け済み' })).toHaveCount(0);

		// 科目にしないと、一覧から外れ、あとで戻せる
		await page
			.getByRole('listitem')
			.filter({ hasText: '架空の演習Ⅱ (再)' })
			.getByRole('button', { name: '科目にしない' })
			.click();
		await expect(page.getByRole('heading', { name: '架空の演習Ⅱ (再)' })).toHaveCount(0);
		const ignored = page.getByRole('region', { name: '科目にしない' });
		await expect(ignored).toContainText('架空の演習Ⅱ (再)');
		await ignored
			.getByRole('listitem')
			.filter({ hasText: '架空の演習Ⅱ (再)' })
			.getByRole('button', { name: '一覧に戻す' })
			.click();
		await expect(page.getByRole('heading', { name: '架空の演習Ⅱ (再)' })).toBeVisible();
		await expect(ignored.getByText('架空の演習Ⅱ (再)')).toHaveCount(0);

		// 紐付けと紐付け外しが、操作の記録に残る (E2E の DB は実行をまたいで残るので、0 件でないことだけ確かめる)
		await page.goto('/app/admin/audit-log');
		const entries = page.getByRole('row');
		await expect(
			entries.filter({ hasText: '架空の演習Ⅱ (再) を 架空の演習Ⅱ1-AB に紐付けた' }),
		).not.toHaveCount(0);
		await expect(entries.filter({ hasText: '架空の演習Ⅱ (再) の紐付けを外した' })).not.toHaveCount(
			0,
		);
	});
});

test.describe('曜日と時限の確認', () => {
	/** ログイン済みの利用者を、直接 DB でモデレーターにする (昇格の画面はまだない、#15) */
	function promoteToModerator(email: string) {
		const database = openDatabase(join(E2E_DATA_DIR, 'funmary.db'), {
			backupDir: join(E2E_DATA_DIR, 'backups'),
		});
		try {
			database.sqlite.prepare(`UPDATE users SET role = 'moderator' WHERE email = ?`).run(email);
		} finally {
			database.close();
		}
	}

	test('確認して登録する設定にすると提出になり、モデレーターが承認すると共有の枠に入って記録に残る。だれも登録できない設定では、個人用だけ使える', async ({
		page,
		browser,
	}) => {
		const name = `E2E の確認演習${Date.now()}`;
		const moderatorEmail = `e2e-slot-moderator-${Date.now()}@fun.ac.jp`;

		// 管理者が、確認してから登録する設定にする
		await signInAs(page, 'e2e-admin@fun.ac.jp');
		await page.goto('/app/admin/slot-review');
		await page.getByRole('radio', { name: 'モデレーターか管理者が確認してから登録する' }).check();
		await page.getByRole('button', { name: '保存する' }).click();
		await expect(page.getByRole('status')).toHaveText('設定を保存しました。');

		// 利用者が、シラバスにない授業を足して、曜日と時限を提出する
		const otherPage = await (await browser.newContext()).newPage();
		await signInAs(otherPage, `e2e-slot-user-${Date.now()}@fun.ac.jp`);
		await otherPage.goto('/app/courses');
		await otherPage.getByText('公開シラバスに載っていない授業を、科目として足す').click();
		await otherPage.getByLabel(/授業の名前/).fill(name);
		await otherPage.getByLabel('学期').selectOption('後期');
		await otherPage.getByRole('button', { name: '足して登録する' }).click();
		await otherPage.getByRole('tab', { name: '登録した科目' }).click();
		const registered = otherPage
			.getByRole('tabpanel', { name: '登録した科目' })
			.getByRole('listitem')
			.filter({ hasText: name });
		await registered.getByText('曜日と時限を登録する', { exact: true }).click();
		const submitForm = registered.locator('details[open]');
		await submitForm.getByLabel('曜日').selectOption('木曜');
		await submitForm.getByLabel('時限').selectOption('4 限');
		await submitForm.getByRole('button', { name: '登録する' }).click();
		await expect(otherPage.getByRole('status')).toContainText('確かめてから登録されます');
		await expect(registered).toContainText('曜日と時限が、まだ登録されていません');

		// モデレーターが承認する (このリポジトリには、まだ昇格の画面がないので、直接 DB でモデレーターにする)
		await signInAs(page, moderatorEmail);
		promoteToModerator(moderatorEmail);
		await page.goto('/app/admin/slot-review');
		const pending = page
			.getByRole('region', { name: '確認待ち' })
			.getByRole('listitem')
			.filter({ hasText: name });
		await expect(pending).toContainText('木曜 4 限');
		await expect(page.getByRole('radio', { name: /確認してから登録する/ })).toHaveCount(0);
		await pending.getByRole('button', { name: '承認する' }).click();
		await expect(page.getByRole('status')).toHaveText('承認し、共有の枠に登録しました。');

		// 共有の枠に入り、操作の記録にも残る
		await registered.getByRole('link', { name }).click();
		await expect(otherPage.getByText('木曜 4 限')).toBeVisible();
		await page.goto('/app/admin/audit-log');
		await expect(
			page.getByRole('row').filter({ hasText: `${name} の曜日と時限の提出を承認した` }),
		).not.toHaveCount(0);

		// だれも登録できない設定にすると、共有の登録の欄は出ず、個人用だけ使える
		await signInAs(page, 'e2e-admin@fun.ac.jp');
		await page.goto('/app/admin/slot-review');
		await page.getByRole('radio', { name: 'だれも登録できない' }).check();
		await page.getByRole('button', { name: '保存する' }).click();
		await otherPage.goto('/app/courses');
		await otherPage.getByRole('tab', { name: '登録した科目' }).click();
		await expect(registered.getByText('曜日と時限を登録する', { exact: true })).toHaveCount(0);
		await registered.getByText('自分だけに使う曜日と時限を登録する').click();
		const personalForm = registered.locator('details[open]');
		await personalForm.getByLabel('曜日').selectOption('金曜');
		await personalForm.getByLabel('時限').selectOption('1 限');
		await personalForm.getByRole('button', { name: '登録する' }).click();
		await expect(otherPage.getByRole('status')).toHaveText(
			'自分だけに使う曜日と時限を登録しました。',
		);
		await expect(registered).toContainText('金曜 1 限');

		// 元の設定 (だれでも登録できる) に戻す
		await page.getByRole('radio', { name: 'だれでも登録できる' }).check();
		await page.getByRole('button', { name: '保存する' }).click();
	});
});

test.describe('学年暦の管理', () => {
	test.beforeAll(() => {
		// 手元では DB が残るので、前回入れた学年暦を消しておく
		seedSubjects((database) => {
			database.sqlite.prepare('DELETE FROM academic_terms WHERE academic_year = 2026').run();
			database.sqlite
				.prepare("DELETE FROM academic_days WHERE date BETWEEN '2026-04-01' AND '2027-03-31'")
				.run();
		});
	});

	const loginAsAdmin = (page: Page) => signInAs(page, 'e2e-admin@fun.ac.jp');

	test('学期の期間、振替授業日、全学の休講日を入れて消せる。入れた値は時間割に使われる', async ({
		page,
	}) => {
		await loginAsAdmin(page);
		await page.goto('/app/settings');
		await expect(page.getByText('推定のままです')).toBeVisible();
		await page.goto('/app/admin/calendar?year=2026');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('2026 年度の学年暦');

		const terms = page.getByRole('region', { name: '学期の期間' });
		await expect(terms.getByRole('row', { name: /^後期/ })).toContainText('推定');

		// 日付の欄のフォームは畳んである
		await terms.getByText('日付を入れて学期の期間を入力する').click();
		// 始まりが終わりより後なら、理由を出して保存しない
		await terms.getByLabel('学期').selectOption('後期');
		await terms.getByLabel('始まりの日').fill('2027-01-22');
		await terms.getByLabel('終わりの日 (最後の授業日)').fill('2027-01-21');
		await terms.getByRole('button', { name: '学期の期間を保存する' }).click();
		await expect(page.getByRole('alert')).toHaveText(
			'始まりの日は、終わりの日より前にしてください',
		);

		await terms.getByLabel('始まりの日').fill('2026-09-24');
		await terms.getByRole('button', { name: '学期の期間を保存する' }).click();
		await expect(page.getByRole('status')).toHaveText('学期の期間を保存しました。');
		const fall = terms.getByRole('row', { name: /^後期/ });
		await expect(fall).toContainText('2026-09-24 から 2027-01-21');
		await expect(fall).toContainText('手入力');
		await expect(terms.getByRole('row', { name: /^3Q/ })).toContainText('後期と同じ期間');

		// 振替授業日と全学の休講日は、1 年の暦で日を押して入れる
		const year = page.getByRole('region', { name: '1 年の暦' });
		const dialog = page.getByRole('dialog');
		await year.getByRole('button', { name: /^10月14日 \(水\)/ }).click();
		await expect(dialog.getByRole('heading', { level: 3 })).toHaveText('2026年10月14日 (水)');
		await expect(dialog).toContainText('学期: 通年、後期、3Q');
		await dialog.getByLabel('行う授業の曜日').selectOption('月曜');
		await dialog.getByRole('button', { name: '振替授業日にする' }).click();
		await expect(page.getByRole('status')).toHaveText('振替授業日を保存しました。');
		await expect(dialog).toBeHidden();
		await expect(year.getByRole('button', { name: /^10月14日 \(水\)/ })).toHaveAccessibleName(
			/振替授業日 \(月曜の授業\)/,
		);
		const substitute = page.getByRole('region', { name: '振替授業日' });
		await expect(substitute.getByRole('listitem')).toHaveText(/10\/14 \(水\) は 月曜の授業/);

		await year.getByRole('button', { name: /^10月16日 \(金\)/ }).click();
		await dialog.getByLabel('行事名 (任意)').fill('架空の行事');
		await dialog.getByRole('button', { name: '全学の休講日にする' }).click();
		await expect(page.getByRole('status')).toHaveText('全学の休講日を保存しました。');
		const noClass = page.getByRole('region', { name: '全学の休講日' });
		await expect(noClass.getByRole('listitem')).toContainText('10/16 (金) (架空の行事)');

		// 矢印キーで日を移れる
		await year.getByRole('button', { name: /^10月16日 \(金\)/ }).focus();
		await page.keyboard.press('ArrowRight');
		await expect(year.getByRole('button', { name: /^10月17日 \(土\)/ })).toBeFocused();

		// 学期の終わりも、暦から決められる
		await year.getByRole('button', { name: /^1月20日 \(水\)/ }).click();
		await dialog.getByLabel('学期').selectOption('後期');
		await dialog.getByRole('button', { name: 'この日を終わりにする' }).click();
		await expect(page.getByRole('status')).toHaveText('学期の期間を保存しました。');
		await expect(terms.getByRole('row', { name: /^後期/ })).toContainText(
			'2026-09-24 から 2027-01-20',
		);

		// 週の時間割の日付の横に出る
		await page.goto('/app/week?date=2026-10-12');
		const headers = page.getByRole('table').getByRole('columnheader');
		await expect(headers.filter({ hasText: '10/14 (水)' })).toContainText('月曜の授業を行う日');
		await expect(headers.filter({ hasText: '10/16 (金)' })).toContainText(
			'全学の休講日 (架空の行事)',
		);

		await page.goto('/app/admin/calendar?year=2026');
		await noClass.getByRole('button', { name: /^消す/ }).click();
		await answerConfirm(page, true);
		await expect(page.getByRole('status')).toHaveText('全学の休講日を消しました。');
		await expect(noClass.getByText('ありません。')).toBeVisible();
		await substitute.getByRole('button', { name: /^消す/ }).click();
		await answerConfirm(page, true);
		await expect(page.getByRole('status')).toHaveText('振替授業日を消しました。');
		await terms.getByRole('row', { name: /^後期/ }).getByRole('button', { name: /^消す/ }).click();
		await answerConfirm(page, true);
		await expect(page.getByRole('status')).toContainText('学期の期間を消しました。');
		await expect(terms.getByRole('row', { name: /^後期/ })).toContainText('推定');
	});

	test('PDF でないファイルや、読めない PDF を上げると、理由を出して取り込まない', async ({
		page,
	}) => {
		await loginAsAdmin(page);
		await page.goto('/app/admin/calendar?year=2026');
		const upload = page.getByRole('region', { name: 'PDF から取り込む' });
		await upload.getByLabel('学年暦の PDF').setInputFiles({
			name: 'calendar.pdf',
			mimeType: 'application/pdf',
			buffer: Buffer.from('<html></html>'),
		});
		await upload.getByRole('button', { name: '読み取る' }).click();
		await expect(page.getByRole('alert')).toHaveText('PDF のファイルではありません。');

		await upload.getByLabel('学年暦の PDF').setInputFiles({
			name: 'calendar.pdf',
			mimeType: 'application/pdf',
			buffer: Buffer.from('%PDF-1.4\n%%EOF'),
		});
		await upload.getByRole('button', { name: '読み取る' }).click();
		await expect(page.getByRole('alert')).toContainText('学年暦の PDF として読めませんでした');
		await expect(page.getByRole('button', { name: 'この内容で取り込む' })).toHaveCount(0);
	});

	test('授業時間割の取り込みの画面でも、読めない PDF は取り込まない', async ({ page }) => {
		await loginAsAdmin(page);
		await page.goto('/app/settings');
		await page.getByRole('link', { name: '授業時間割の取り込み' }).click();
		await page.getByLabel('授業時間割の PDF').setInputFiles({
			name: 'timetable.pdf',
			mimeType: 'application/pdf',
			buffer: Buffer.from('%PDF-1.4\n%%EOF'),
		});
		await page.getByRole('button', { name: '読み取る' }).click();
		await expect(page.getByRole('alert')).toContainText('授業時間割の PDF として読めませんでした');
	});
});

test.describe('サポートサーバーの招待', () => {
	// 手元では DB が残るので、前の実行で入れた招待を消してから始める
	test.beforeAll(() => {
		seedSubjects((database) => {
			database.sqlite.prepare("DELETE FROM settings WHERE key = 'support-invites'").run();
		});
	});

	test.afterAll(() => {
		seedSubjects((database) => {
			database.sqlite.prepare("DELETE FROM settings WHERE key = 'support-invites'").run();
		});
	});

	test('管理者が自分で作った招待を登録して公開すると、「このアプリについて」に出る。取り消すと消える', async ({
		page,
	}) => {
		const email = 'e2e-admin@fun.ac.jp';
		await oidc.setIdentity({ sub: email, email, email_verified: true, hd: 'fun.ac.jp' });
		await signIn(page);
		await page.goto('/app/settings');
		await page.getByRole('link', { name: 'サポートサーバーの招待' }).click();
		// E2E では Bot を設定していない
		await expect(page.getByRole('region', { name: 'Bot で発行する' })).toContainText(
			'DISCORD_BOT_TOKEN',
		);

		const register = page.getByRole('region', { name: '自分で作った招待を登録する' });
		await register.getByLabel('招待の URL').fill('https://example.com/abc');
		await register.getByRole('button', { name: '登録する' }).click();
		await expect(page.getByRole('alert')).toContainText('Discord の招待の URL');

		await register.getByLabel('招待の URL').fill('https://discord.gg/e2eSupport');
		await register.getByLabel('メモ (任意)').fill('E2E');
		await register.getByRole('button', { name: '登録する' }).click();
		await expect(page.getByRole('status')).toContainText('招待を登録しました');
		const item = page
			.getByRole('region', { name: '使える招待' })
			.getByRole('listitem')
			.filter({ hasText: 'https://discord.gg/e2eSupport' });
		await expect(item).toContainText('非公開');

		// 非公開のうちは出ない
		await page.goto('/about');
		await expect(page.getByRole('link', { name: 'Discord のサポートサーバー' })).toHaveCount(0);

		await page.goto('/app/admin/support-invites');
		await item.getByRole('button', { name: '公開する' }).click();
		await expect(page.getByRole('status')).toContainText('公開にしました');
		await page.goto('/about');
		const link = page.getByRole('link', { name: 'Discord のサポートサーバー' });
		await expect(link).toHaveAttribute('href', 'https://discord.gg/e2eSupport');
		await expect(link).toHaveAttribute('target', '_blank');

		await page.goto('/app/admin/support-invites');
		await item.getByRole('button', { name: '取り消す' }).click();
		await expect(page.getByRole('status')).toContainText('招待を取り消しました');
		await expect(
			page.getByRole('region', { name: '使えなくなった招待' }).getByRole('listitem'),
		).toContainText('取り消し済み');
		await page.goto('/about');
		await expect(page.getByRole('link', { name: 'Discord のサポートサーバー' })).toHaveCount(0);
	});
});

test.describe('学内のネットワーク', () => {
	const clearRanges = () =>
		seedSubjects((database) => {
			database.sqlite.prepare("DELETE FROM settings WHERE key = 'campus-ip-ranges'").run();
		});
	// 手元では DB が残るので、前の実行で登録した範囲を消してから始める
	test.beforeEach(clearRanges);
	test.afterAll(clearRanges);

	const openPage = async (page: Page) => {
		await oidc.setIdentity({
			sub: 'e2e-admin@fun.ac.jp',
			email: 'e2e-admin@fun.ac.jp',
			email_verified: true,
			hd: 'fun.ac.jp',
		});
		await signIn(page);
		await page.goto('/app/settings');
		await page.getByRole('link', { name: '学内のネットワーク' }).click();
		await expect(page.getByRole('heading', { name: '学内のネットワーク', level: 1 })).toBeVisible();
	};

	test('範囲を入力して登録し、重ねて登録できず、消せる', async ({ page }) => {
		await openPage(page);
		const register = page.getByRole('region', { name: '範囲を入力して登録する' });

		await register.getByLabel('アドレスか範囲').fill('abc');
		await register.getByRole('button', { name: '登録する' }).click();
		await expect(page.getByRole('alert')).toContainText('IPv4 のアドレスか');

		// ホスト部が 0 でなくても、範囲の先頭にそろえて登録する
		await register.getByLabel('アドレスか範囲').fill('203.0.113.77/24');
		await register.getByLabel('メモ (任意)').fill('E2E の範囲');
		await register.getByRole('button', { name: '登録する' }).click();
		await expect(
			page.getByRole('status').filter({ hasText: '203.0.113.0/24 を登録しました' }),
		).toBeVisible();
		const item = page
			.getByRole('region', { name: '登録した範囲' })
			.getByRole('listitem')
			.filter({ hasText: '203.0.113.0/24' });
		await expect(item).toContainText('E2E の範囲');

		await register.getByLabel('アドレスか範囲').fill('203.0.113.0/24');
		await register.getByRole('button', { name: '登録する' }).click();
		await expect(page.getByRole('alert')).toContainText('すでに登録してあります');

		await item.getByRole('button', { name: '消す' }).click();
		await expect(
			page.getByRole('status').filter({ hasText: '203.0.113.0/24 の登録を消しました' }),
		).toBeVisible();
		await expect(item).toHaveCount(0);
	});

	test('いまのアドレスが登録済みかを、押す前から出し、ボタンで登録できる', async ({ page }) => {
		await openPage(page);
		const address = (await page.locator('.address code').innerText()).trim();
		// 接続元が IPv6 の環境 (localhost が ::1 になるとき) では、登録できないことだけを確かめる
		const isIpv4 = /^\d+\.\d+\.\d+\.\d+$/.test(address);
		const current = page.getByRole('region', { name: 'いまの接続' });
		const own = current.getByRole('button', { name: 'このアドレスだけを登録する' });
		const subnet = current.getByRole('button', { name: '同じ範囲 (/24) を登録する' });
		if (!isIpv4) {
			await expect(current).toContainText('登録できません');
			await expect(own).toBeDisabled();
			await expect(subnet).toBeDisabled();
			return;
		}

		await expect(current).toContainText('未登録');
		await expect(own).toBeEnabled();
		await own.click();
		await expect(page.getByRole('alert')).toHaveCount(0);

		// ボタンを押す前の表示でも、登録済みと分かる
		await page.reload();
		await expect(current).toContainText('登録済み');
		await expect(current).toContainText(address);
		await expect(own).toBeDisabled();
		await expect(subnet).toBeDisabled();
		const item = page
			.getByRole('region', { name: '登録した範囲' })
			.getByRole('listitem')
			.filter({ hasText: address });
		await expect(item).toContainText('いまの接続');

		await item.getByRole('button', { name: '消す' }).click();
		await expect(current).toContainText('未登録');
		await expect(own).toBeEnabled();
	});
});

test.describe('取得元と実行履歴', () => {
	test.beforeAll(() => {
		seedSubjects((database) => {
			// 未来の時刻にして、実行履歴の先頭に出す
			const started = Date.parse('2030-01-01T03:00:00Z');
			database.sqlite
				.prepare(
					`INSERT OR REPLACE INTO source_status
						(source, last_success_at, last_attempt_at, consecutive_failures, next_attempt_at, last_error)
						VALUES ('portal', ?, ?, 3, ?, '架空のタイムアウト')`,
				)
				.run(started - 3_600_000, started, started + 3_600_000);
			database.sqlite.prepare("DELETE FROM job_runs WHERE message = '架空のタイムアウト'").run();
			database.sqlite
				.prepare(
					`INSERT INTO job_runs (job, started_at, finished_at, status, message)
						VALUES ('scrape-portal', ?, ?, 'failed', '架空のタイムアウト')`,
				)
				.run(started, started + 2_000);
		});
	});

	// 手元では DB が残るので、入れた行を消す (今日の画面の「まだ取得していません」のテストに響くため)
	test.afterAll(() => {
		seedSubjects((database) => {
			database.sqlite.prepare("DELETE FROM source_status WHERE source = 'portal'").run();
			database.sqlite.prepare("DELETE FROM job_runs WHERE message = '架空のタイムアウト'").run();
		});
	});

	test('管理者は、取得元の状態と実行履歴を見られる', async ({ page }) => {
		const email = 'e2e-admin@fun.ac.jp';
		await oidc.setIdentity({ sub: email, email, email_verified: true, hd: 'fun.ac.jp' });
		await signIn(page);
		await page.goto('/app/settings');
		await page.getByRole('link', { name: '取得元と実行履歴' }).click();

		const portal = page
			.getByRole('region', { name: '取得元の状態' })
			.getByRole('listitem')
			.filter({ hasText: '学生ポータル (休講など)' });
		await expect(portal).toContainText('不調');
		await expect(portal).toContainText('最終試行 2030-01-01 12:00');
		await expect(portal).toContainText('架空のタイムアウト');

		const first = page.getByRole('region', { name: '定期処理の実行履歴' }).getByRole('row').nth(1);
		await expect(first).toContainText('2030-01-01 12:00');
		await expect(first).toContainText('休講などの取得');
		await expect(first).toContainText('失敗');
		await expect(first).toContainText('2 秒');
	});

	test('管理者は、定期処理を今すぐ動かせる。応答時間の分布も見られる', async ({ page }) => {
		const email = 'e2e-admin@fun.ac.jp';
		await oidc.setIdentity({ sub: email, email, email_verified: true, hd: 'fun.ac.jp' });
		await signIn(page);
		await page.goto('/app/admin/status');

		// 外へ通信しない処理 (時間割の PDF の取り込みの案内) を動かす
		await page
			.getByRole('region', { name: '今すぐ動かす' })
			.getByRole('listitem')
			.filter({ hasText: '時間割の PDF の取り込みの案内' })
			.getByRole('button', { name: '動かす' })
			.click();
		await expect(page.getByRole('status').first()).toContainText(
			'時間割の PDF の取り込みの案内 を動かしました',
		);
		await expect(
			page
				.getByRole('region', { name: '定期処理の実行履歴' })
				.getByRole('row')
				.filter({ hasText: '時間割の PDF の取り込みの案内' })
				.first(),
		).toContainText('成功');

		// ここまでの画面の表示で、応答時間が記録されている
		const responses = page.getByRole('region', { name: '応答時間 (直近 24 時間)' });
		await expect(responses).toContainText('100 ms 以内');
		await expect(responses.getByRole('table', { name: '応答時間の分布' })).toBeVisible();
	});
});

test.describe('招待コード', () => {
	// E2E の DB は実行をまたいで残る。月の上限に届かないよう、実行ごとに別の人にする
	const member = `e2e-invite-${Date.now()}@fun.ac.jp`;

	test('管理者は招待コードを発行でき、登録の URL を 1 回だけ出す。一覧に出て、取り消せる', async ({
		page,
	}) => {
		await signInAs(page, 'e2e-admin@fun.ac.jp');
		// 招待は、メニューではなく、設定の中にある
		await expect(
			page
				.getByRole('navigation', { name: 'メニュー' })
				.first()
				.getByRole('link', { name: '招待' }),
		).toHaveCount(0);
		await page.goto('/app/settings');
		await page.getByRole('link', { name: /^招待 友だち/ }).click();
		await expect(page).toHaveURL('/app/settings/invites');
		await expect(page.getByRole('navigation', { name: 'パンくず' })).toContainText('設定');
		await page.getByLabel('使用回数').fill('2');
		await page.getByRole('textbox', { name: /^メモ/ }).fill('E2E の研究室');
		await page.getByRole('button', { name: '招待コードを発行する' }).click();

		const url = page.getByLabel('登録の URL');
		await expect(url).toHaveValue(/\/signup\?code=[\w-]+$/);
		const list = page.getByRole('region', { name: '発行した招待コード' });
		await expect(list).toContainText('E2E の研究室');
		await expect(list).toContainText('使用 0 / 2 回');

		// 開き直すと、コードはもう出ない
		await page.reload();
		await expect(page.getByLabel('登録の URL')).toHaveCount(0);

		// 取り消したコードは、一覧から消える (E2E の DB は実行をまたいで残るので、数で確かめる)
		const lab = list.getByRole('listitem').filter({ hasText: 'E2E の研究室' });
		const before = await lab.count();
		await lab
			.first()
			.getByRole('button', { name: /^取り消す/ })
			.click();
		await answerConfirm(page, true);
		await expect(page.getByRole('status').first()).toHaveText('招待コードを取り消しました。');
		await expect(lab).toHaveCount(before - 1);
	});

	test('管理者のみのモードでは、ほかの人には招待が出ない。許可したユーザーのモードで許可すると、発行できる', async ({
		browser,
	}) => {
		const memberPage = await (await browser.newContext()).newPage();
		await signInAs(memberPage, member);
		await memberPage.goto('/app/settings');
		await expect(memberPage.getByRole('link', { name: /^招待 友だち/ })).toHaveCount(0);
		await memberPage.goto('/app/settings/invites');
		await expect(memberPage.getByRole('button', { name: '招待コードを発行する' })).toHaveCount(0);

		const adminPage = await (await browser.newContext()).newPage();
		await signInAs(adminPage, 'e2e-admin@fun.ac.jp');
		await adminPage.goto('/app/admin/invites');
		const memberRow = adminPage.getByRole('listitem').filter({ hasText: member });
		const limit = adminPage.getByLabel('1 か月に発行できる数');
		// 管理者のみのときは、月の上限を使わない
		await expect(limit).toBeDisabled();
		await adminPage.getByLabel(/許可したユーザー/).check();
		await expect(limit).toBeEnabled();
		await expect(adminPage.getByText('保存していない変更があります')).toBeVisible();
		await adminPage.getByRole('button', { name: '保存する' }).click();
		await expect(adminPage.getByRole('status')).toHaveText(
			'招待コードを発行できる人の設定を保存しました。',
		);
		// 保存したあとも、選んだモードと上限がそのまま出ている
		await expect(adminPage.getByLabel(/許可したユーザー/)).toBeChecked();
		await expect(limit).toHaveValue('5');
		await expect(adminPage.getByText('保存していない変更があります')).toBeHidden();
		await memberRow.getByRole('button', { name: /^許可する/ }).click();
		await expect(memberRow.getByRole('button', { name: /^許可を外す/ })).toBeVisible();

		await memberPage.goto('/app/settings/invites');
		// 管理者でない人は、回数と期限を決められない
		await expect(memberPage.getByLabel('使用回数')).toHaveCount(0);
		await expect(memberPage.getByText('今月はあと 5')).toBeVisible();
		await memberPage.getByRole('button', { name: '招待コードを発行する' }).click();
		await expect(memberPage.getByLabel('登録の URL')).toHaveValue(/\/signup\?code=/);
		await expect(memberPage.getByRole('region', { name: '発行した招待コード' })).toContainText(
			'使用 0 / 1 回',
		);

		// ほかのテストに影響しないよう、管理者のみに戻す
		await memberRow.getByRole('button', { name: /^許可を外す/ }).click();
		// 許可を外す操作の完了 (一覧の更新) を待ってから、モードを戻す。重なると、選び直しが失敗することがある
		await expect(memberRow.getByRole('button', { name: /^許可する/ })).toBeVisible();
		await adminPage.getByLabel(/管理者のみ/).check();
		await expect(limit).toBeDisabled();
		await adminPage.getByRole('button', { name: '保存する' }).click();
		await expect(adminPage.getByRole('status')).toHaveText(
			'招待コードを発行できる人の設定を保存しました。',
		);
		await expect(adminPage.getByLabel(/管理者のみ/)).toBeChecked();
		// 無効にした欄は送られないが、前に決めた上限は残る
		await expect(limit).toHaveValue('5');
	});
});

test.describe('テストアカウント', () => {
	test('管理者が、大学のアカウントでない Google のアカウントを足すと、そのアカウントでログインでき、データを写し、消せる', async ({
		page,
		browser,
	}) => {
		const tester = `e2e-tester-${Date.now()}@gmail.com`;
		await signInAs(page, 'e2e-admin@fun.ac.jp');
		await page.goto('/app/admin/test-accounts');

		// 大学のアカウントと、形の違うものは足せない
		await page.getByLabel(/Google アカウントのメールアドレス/).fill('someone@fun.ac.jp');
		await page.getByRole('button', { name: '足す' }).click();
		await expect(page.getByRole('alert')).toContainText('大学のアカウントは');

		await page.getByLabel(/Google アカウントのメールアドレス/).fill(tester);
		await page.getByRole('button', { name: '足す' }).click();
		await expect(page.getByRole('status')).toContainText('足しました');
		const item = page.getByRole('listitem').filter({ hasText: tester });
		await expect(item).toContainText('まだログインしていません');

		// 用意していない Google アカウントは、断られる
		const guest = await browser.newContext();
		const guestPage = await guest.newPage();
		await oidc.setIdentity({
			sub: 'e2e-stranger',
			email: 'stranger@gmail.com',
			email_verified: true,
		});
		await guestPage.goto('/auth/google/test');
		await expect(guestPage).toHaveURL(/\/login\?error=/);

		// 用意したアカウントでは、入れる (規約への同意から)
		await oidc.setIdentity({ sub: tester, email: tester, email_verified: true });
		await guestPage.goto('/auth/google/test');
		await expect(guestPage).toHaveURL(/\/consent/);
		await guestPage.getByLabel('利用規約とプライバシーポリシーに同意します').check();
		await guestPage.getByRole('button', { name: '同意して続ける' }).click();
		await expect(guestPage).toHaveURL('/app');

		// ログインしたら、データを写せる
		await page.reload();
		await expect(item).toContainText('ログイン済み');
		await item.getByRole('button', { name: '自分のデータを写す' }).click();
		await answerConfirm(page, true);
		await expect(page.getByRole('status')).toContainText('写しました');

		// 消すと、テストアカウントのセッションも使えなくなる
		await item.getByRole('button', { name: '消す' }).click();
		await answerConfirm(page, true);
		await expect(item).toHaveCount(0);
		await guestPage.goto('/app');
		await expect(guestPage).toHaveURL('/login');
		await guest.close();
	});
});
