// 今日と週の時間割、自分の予定。
import { expect, test, type Page, type Locator } from '@playwright/test';
import { createCourseStore, createSubjectStore } from '@funmary/db';
import { oidc, signIn, useMockOidc, seedSubjects } from './support.ts';

// サーバーの状態 (次にログインする人) を共有するので、テストは 1 つずつ動かす
test.describe.configure({ mode: 'serial' });
useMockOidc();

test.describe('今日と週の時間割', () => {
	// 手元では DB がテストのたびに消えないので、利用者を毎回変える
	const sub = `e2e-week-${Date.now()}`;
	const email = `${sub}@fun.ac.jp`;

	const loginAs = async (page: Page) => {
		oidc.setIdentity({ sub, email, email_verified: true, hd: 'fun.ac.jp' });
		await signIn(page);
		await expect(page).toHaveURL('/app');
	};

	/** ログインした利用者に、架空の科目を履修登録し、火曜 3 限の枠と、休講などを入れる */
	const registerSubject = () =>
		seedSubjects((database) => {
			const subjectId = createSubjectStore(database).upsert(
				{
					academicYear: 2026,
					syllabusId: '900003',
					name: '架空の時間割演習',
					teacher: null,
					credits: 2,
					term: 'fall',
					attributes: {},
					syllabus: {},
					syllabusUrl: null,
				},
				new Date(),
			);
			const user = database.sqlite.prepare('SELECT id FROM users WHERE email = ?').get(email) as {
				id: string;
			};
			const courses = createCourseStore(database);
			courses.register(user.id, subjectId, new Date());
			database.sqlite.prepare('DELETE FROM timetable_slots WHERE subject_id = ?').run(subjectId);
			courses.addSharedSlots(
				[{ subjectId, weekday: 2, period: 3, room: '363' }],
				{ source: 'manual', createdBy: user.id },
				new Date(),
			);
			const insertChange = database.sqlite.prepare(
				`INSERT INTO class_changes
					(kind, subject_id, lesson_name, date, period, room, from_room, first_seen_at, last_seen_at)
					VALUES (?, ?, '架空の時間割演習', ?, ?, ?, ?, 0, 0)
					ON CONFLICT DO UPDATE SET subject_id = excluded.subject_id`,
			);
			insertChange.run('roomChange', subjectId, '2026-10-06', 3, '講堂', '363');
			insertChange.run('makeup', subjectId, '2026-10-08', 5, null, null);
		});

	test('ログインしていなければ、週の時間割はログインの画面に移る', async ({ page }) => {
		await page.goto('/app/week');
		await expect(page).toHaveURL('/login');
	});

	test('履修科目がなければ、今日の画面に登録への案内が出る', async ({ page }) => {
		await loginAs(page);
		await expect(page.getByRole('heading', { name: '次の授業' })).toBeVisible();
		await expect(page.getByRole('link', { name: '履修科目を登録する' })).toBeVisible();
		await expect(page.getByText('休講情報をまだ取得していません')).toBeVisible();
	});

	test('幅が狭いときの週の時間割は、曜日を必ず 2 行目に置き、時限の時刻を 2 行にそろえる', async ({
		page,
	}) => {
		await loginAs(page);
		registerSubject();
		await page.setViewportSize({ width: 390, height: 800 });
		await page.goto('/app/week?date=2026-10-07');
		await page.getByRole('button', { name: '週', exact: true }).click();

		const top = async (locator: Locator) => (await locator.boundingBox())?.y ?? Number.NaN;
		const dates = page.locator('thead .date');
		const weekdays = page.locator('thead .weekday');
		await expect(weekdays).toHaveCount(5);
		for (let i = 0; i < 5; i++) {
			expect(await top(weekdays.nth(i))).toBeGreaterThan((await top(dates.nth(i))) + 8);
		}
		// 各限に時刻が出て、「開始-」と「終了」が別の行になる
		const time = page.locator('tbody .time').first();
		await expect(time).toBeVisible();
		expect(await top(time.locator('.end'))).toBeGreaterThan(
			(await top(time.locator('.start'))) + 8,
		);
	});

	test('週の時間割に、教室変更と補講を文字で出し、補講の仮の教室を示す', async ({ page }) => {
		await loginAs(page);
		registerSubject();
		await page.getByRole('link', { name: '時間割', exact: true }).click();
		await expect(page).toHaveURL('/app/week');

		await page.goto('/app/week?date=2026-10-07');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('10/5 (月) からの週');
		const table = page.getByRole('table');
		await expect(table.getByRole('columnheader')).toHaveText([
			'時限',
			'10/5 (月)',
			'10/6 (火)',
			'10/7 (水)',
			'10/8 (木)',
			'10/9 (金)',
		]);
		const third = table
			.getByRole('row')
			.filter({ has: page.getByRole('rowheader', { name: /^3 限/ }) });
		await expect(third).toContainText('架空の時間割演習');
		await expect(third).toContainText('教室変更');
		await expect(third).toContainText('講堂');
		const fifth = table
			.getByRole('row')
			.filter({ has: page.getByRole('rowheader', { name: /^5 限/ }) });
		await expect(fifth).toContainText('補講');
		await expect(fifth).toContainText('363 (仮。ふだんの教室)');

		// 次の週の月曜 (2026-10-12) はスポーツの日
		await page.getByRole('link', { name: '次の週' }).click();
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('10/12 (月) からの週');
		const holiday = table.getByRole('columnheader', { name: /10\/12 \(月\)/ });
		await expect(holiday).toContainText('祝日');
		await expect(holiday).toContainText('スポーツの日');

		// 週は日曜から土曜なので、日曜の日付は次の月曜からの週になる
		await page.goto('/app/week?date=2026-10-11');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('10/12 (月) からの週');

		// カレンダーで日付を選ぶと、その日を含む週に移る
		// スマホの Safari は入力欄を直接押さないと日付の選択を開けないので、入力欄がボタンに重なっていることを確かめる
		const calendarButton = page.getByRole('button', {
			name: 'カレンダーで日付を選んで、その週を出す',
		});
		const dateInput = page.locator('.picker input[type="date"]');
		expect(await dateInput.boundingBox()).toEqual(await calendarButton.boundingBox());
		await dateInput.click();
		// 年を打っている途中の日付 (0001 年など) では移らない
		await dateInput.fill('0001-11-04');
		await expect(page).toHaveURL('/app/week?date=2026-10-11');
		await dateInput.fill('2026-11-04');
		await expect(page).toHaveURL('/app/week?date=2026-11-04');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('11/2 (月) からの週');
		for (let i = 0; i < 3; i++) await page.getByRole('link', { name: '前の週' }).click();
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('10/12 (月) からの週');

		await table.getByRole('link', { name: '架空の時間割演習' }).first().click();
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('架空の時間割演習');
	});

	test('画面の色は、自動、ライト、ダークの順に切り替わり、読み込み直しても保たれる', async ({
		page,
	}) => {
		await loginAs(page);
		const html = page.locator('html');
		const toggle = page
			.getByRole('navigation', { name: 'メニュー' })
			.getByRole('button', { name: /^画面の色/ });
		await expect(html).toHaveAttribute('data-theme', 'system');
		await expect(toggle).toHaveAccessibleName('画面の色: 自動 (押すとライトに切り替えます)');
		await toggle.click();
		await expect(html).toHaveAttribute('data-theme', 'light');
		await toggle.click();
		await expect(html).toHaveAttribute('data-theme', 'dark');
		await page.reload();
		await expect(html).toHaveAttribute('data-theme', 'dark');
		await expect(page.locator('body')).toHaveCSS('color', 'rgb(230, 225, 225)');
		await toggle.click();
		await expect(html).toHaveAttribute('data-theme', 'system');
		expect((await page.context().cookies()).some((c) => c.name === 'fm-theme')).toBe(false);
	});

	test('ボタンは、表示や状態が変わっても、押せる範囲の大きさと位置を変えない', async ({ page }) => {
		await loginAs(page);
		const menu = page.getByRole('navigation', { name: 'メニュー' });
		const toggle = menu.getByRole('button', { name: /^画面の色/ });
		const show = menu.getByRole('button', { name: /^メールアドレスを/ });

		// 画面の色のボタンは、表示名が変わっても同じ大きさ
		const first = await toggle.boundingBox();
		for (let i = 0; i < 3; i++) {
			await toggle.click();
			expect(await toggle.boundingBox()).toEqual(first);
		}

		// メールアドレスを表示しても、ボタンの位置とアドレスの欄の大きさは変わらない
		const address = menu.locator('.masked-email');
		const hidden = await show.boundingBox();
		const hiddenAddress = await address.boundingBox();
		await show.click();
		expect(await show.boundingBox()).toEqual(hidden);
		expect(await address.boundingBox()).toEqual(hiddenAddress);

		// 今週と次の週で、次の週のボタンの位置は変わらない
		await page.goto('/app/week');
		const next = page.getByRole('link', { name: '次の週' });
		const thisWeek = await next.boundingBox();
		await next.click();
		await expect(page).toHaveURL(/date=/);
		expect(await next.boundingBox()).toEqual(thisWeek);

		// スマホの幅では、上部の画面の色のボタンは 48px 四方
		await page.setViewportSize({ width: 412, height: 915 });
		const header = page.getByRole('banner');
		const box = await header.getByRole('button', { name: /^画面の色/ }).boundingBox();
		expect([box?.width, box?.height]).toEqual([48, 48]);
	});

	test('ログアウトは、設定の画面にあり、PC のメニューとスマホの上部からは外れている', async ({
		page,
	}) => {
		await loginAs(page);
		await expect(
			page
				.getByRole('navigation', { name: 'メニュー' })
				.getByRole('button', { name: 'ログアウト' }),
		).toHaveCount(0);
		await expect(page.getByRole('banner').getByRole('button', { name: 'ログアウト' })).toHaveCount(
			0,
		);
		await page.goto('/app/settings');
		await expect(page.getByRole('region', { name: 'アカウント' })).toContainText('ログアウト');
	});

	test('週の時間割の見せ方は、狭い画面では自動で 1 日ずつ、選べば週を並べ、読み込み直しても保たれる', async ({
		page,
	}) => {
		await loginAs(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/app/week?date=2026-09-09');
		const views = page.getByRole('group', { name: '時間割の見せ方' });
		const auto = views.getByRole('button', { name: '自動' });
		const day = views.getByRole('button', { name: '1日' });
		const week = views.getByRole('button', { name: '週', exact: true });
		const headers = page.getByRole('columnheader', { name: /^\d+\/\d+ \(.\)/ });
		const inView = async (index: number) => {
			const box = await headers.nth(index).boundingBox();
			return box !== null && box.x >= 0 && box.x + box.width <= (page.viewportSize()?.width ?? 0);
		};

		// 自動は、狭い画面では 1 日ずつ。月曜だけが画面に入る
		await expect(auto).toHaveAttribute('aria-pressed', 'true');
		expect(await inView(0)).toBe(true);
		expect(await inView(4)).toBe(false);

		// 週にすると、月曜から金曜が画面に収まる。ボタンの大きさと位置は変わらない
		const before = await day.boundingBox();
		await week.click();
		await expect(week).toHaveAttribute('aria-pressed', 'true');
		expect(await day.boundingBox()).toEqual(before);
		for (let i = 0; i < 5; i++) expect(await inView(i)).toBe(true);

		// 読み込み直しても保たれる。1 日ずつを選べば、広い画面でも 1 日ずつになる
		await page.reload();
		await expect(week).toHaveAttribute('aria-pressed', 'true');
		await page.setViewportSize({ width: 1280, height: 900 });
		for (let i = 0; i < 5; i++) expect(await inView(i)).toBe(true);
		await day.click();
		await expect(day).toHaveAttribute('aria-pressed', 'true');
		await page.setViewportSize({ width: 390, height: 844 });
		expect(await inView(4)).toBe(false);
		await auto.click();
		await page.reload();
		await expect(auto).toHaveAttribute('aria-pressed', 'true');
	});

	test('1 日ずつの見せ方では、今週を開いたとき今日の列が画面に入る', async ({ page }) => {
		// 日曜と土曜は、授業がなければ列がないので、平日だけ確かめる
		const weekday = new Date(Date.now() + 9 * 3600_000).getUTCDay();
		test.skip(weekday === 0 || weekday === 6, '今日が週末だと、今日の列がない');
		await loginAs(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/app/week');
		const today = page.locator('thead th.today');
		await expect(today).toBeVisible();
		await expect
			.poll(async () => {
				const box = await today.boundingBox();
				return box !== null && box.x >= 0 && box.x + box.width <= 390;
			})
			.toBe(true);
	});

	test('時間割の取り込みは、ブックマークに登録する方法と、コンソールで実行する方法を選べる', async ({
		page,
	}) => {
		await loginAs(page);
		await page.goto('/app/courses/import');
		const methods = page.getByRole('group', { name: '取り込みの方法' });
		const bookmark = methods.getByRole('button', { name: 'ブックマークに登録する' });
		const console_ = methods.getByRole('button', { name: 'コンソールで実行する' });

		await expect(bookmark).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByRole('link', { name: 'Funmary に時間割を取り込む' })).toBeVisible();

		const before = await bookmark.boundingBox();
		await console_.click();
		await expect(console_).toHaveAttribute('aria-pressed', 'true');
		expect(await bookmark.boundingBox()).toEqual(before);
		await expect(page.getByRole('textbox', { name: '取り込みのコード' })).toHaveValue(
			/^\(function\(\)\{[\s\S]*students\.fun\.ac\.jp/,
		);
		await expect(page.getByRole('button', { name: 'コードをコピーする' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Funmary に時間割を取り込む' })).toBeHidden();
	});

	test('暦にない日付の週は、今週に移る', async ({ page }) => {
		await loginAs(page);
		await page.goto('/app/week?date=2026-02-30');
		await expect(page).toHaveURL('/app/week');
	});
});

test.describe('自分の予定', () => {
	// E2E の DB は実行をまたいで残るので、実行ごとに別の人にする
	const owner = `e2e-events-${Date.now()}@fun.ac.jp`;
	const other = `e2e-events-other-${Date.now()}@fun.ac.jp`;
	const login = async (page: Page, email: string) => {
		oidc.setIdentity({ sub: email, email, email_verified: true, hd: 'fun.ac.jp' });
		await signIn(page);
		await expect(page).toHaveURL('/app');
	};

	test('予定を足し、繰り返しを設定し、ある日を除き、直し、消せる。ほかの人には見えない', async ({
		browser,
		page,
	}) => {
		await login(page, owner);
		await page.getByRole('link', { name: '時間割', exact: true }).click();
		await page.getByRole('link', { name: '自分の予定' }).click();
		await expect(page.getByText('まだ予定がありません')).toBeVisible();

		// 毎週 月と水、時限で、4 回まで
		await page.getByRole('link', { name: '予定を足す' }).click();
		await page.getByLabel('予定の名前').fill('架空のサークル練習');
		await page.getByLabel('場所 (任意)').fill('架空の部室');
		await page.getByLabel('開始日').fill('2026-11-02');
		await page.getByRole('radio', { name: '時限で決める' }).check();
		await page.getByLabel('始まりの時限').selectOption('5');
		await page.getByLabel('終わりの時限').selectOption('6');
		await page.getByLabel('繰り返しの種類').selectOption('weekly');
		await page.getByRole('checkbox', { name: '月' }).check();
		await page.getByRole('checkbox', { name: '水' }).check();
		await page.getByRole('radio', { name: '回数まで' }).check();
		await page.getByLabel('繰り返す回数').fill('4');
		await page.getByRole('button', { name: '足す' }).click();

		await expect(page.getByRole('status')).toHaveText('予定を足しました。');
		const item = page.getByRole('listitem').filter({ hasText: '架空のサークル練習' });
		await expect(item).toContainText('11/2 (月)、5 限から 6 限');
		await expect(item).toContainText('繰り返し: 毎週 月、水、4 回まで');
		await expect(item).toContainText('場所: 架空の部室');

		// 11/4 の回を除く
		await item.getByRole('link', { name: /^編集/ }).click();
		await expect(page.getByLabel('予定の名前')).toHaveValue('架空のサークル練習');
		await page.getByRole('checkbox', { name: /^11\/4 \(水\)/ }).check();
		await page.getByRole('button', { name: '保存する' }).click();
		await expect(page.getByRole('status')).toHaveText('予定を直しました。');
		await page.getByRole('link', { name: /^編集/ }).click();
		await expect(page.getByRole('checkbox', { name: /^11\/4 \(水\)/ })).toBeChecked();
		await expect(page.getByRole('checkbox', { name: /^11\/2 \(月\)/ })).not.toBeChecked();

		// 誤りは、入力を残して知らせる
		await page.getByLabel('終了日 (数日にわたるときだけ)').fill('2026-10-01');
		await page.getByRole('button', { name: '保存する' }).click();
		await expect(page.getByRole('alert')).toContainText('終了日は、開始日以降にしてください');
		await expect(page.getByLabel('場所 (任意)')).toHaveValue('架空の部室');

		// ほかの人には、見えず、開けない
		const editUrl = page.url();
		const otherPage = await (await browser.newContext()).newPage();
		await login(otherPage, other);
		expect((await otherPage.goto(editUrl))?.status()).toBe(404);
		await otherPage.goto('/app/events');
		await expect(otherPage.getByText('まだ予定がありません')).toBeVisible();

		// 消す
		page.once('dialog', (dialog) => dialog.accept());
		await page.getByRole('button', { name: 'この予定を消す' }).click();
		await expect(page.getByRole('status')).toHaveText('予定を消しました。');
		await expect(page.getByText('まだ予定がありません')).toBeVisible();
	});

	test('足した予定が、今日の画面と週の時間割に出る', async ({ page }) => {
		await login(page, `e2e-events-views-${Date.now()}@fun.ac.jp`);
		// 日本時間の今日
		const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
		await page.goto('/app/events');
		await page.getByRole('link', { name: '予定を足す' }).click();
		await expect(page.getByRole('heading', { name: '予定を足す' })).toBeVisible();
		await page.getByLabel('予定の名前').fill('今日の架空の予定');
		await page.getByLabel('場所 (任意)').fill('架空の広場');
		await page.getByLabel('開始日').fill(today);
		await page.getByRole('radio', { name: '終日' }).check();
		await page.getByRole('button', { name: '足す' }).click();
		await expect(page.getByRole('status')).toHaveText('予定を足しました。');

		// ホームの画面
		await page
			.getByRole('navigation', { name: 'メニュー' })
			.getByRole('link', { name: 'ホーム', exact: true })
			.click();
		const section = page.getByRole('region', { name: '今日の予定' });
		await expect(section).toContainText('終日');
		await expect(section).toContainText('今日の架空の予定');
		await expect(section).toContainText('架空の広場');
		await section.getByRole('link', { name: '今日の架空の予定' }).click();
		await expect(page.getByRole('heading', { name: '予定を直す' })).toBeVisible();

		// 週の時間割の「予定」の行
		await page.goto('/app/week');
		const row = page
			.getByRole('row')
			.filter({ has: page.getByRole('rowheader', { name: '予定' }) });
		await expect(row).toContainText('今日の架空の予定');
		await expect(row).toContainText('終日');
	});

	test('時限で決めた予定が、週の時間割の時限行に出る', async ({ page }) => {
		await login(page, `e2e-period-events-${Date.now()}@fun.ac.jp`);
		const date = '2026-12-07';
		await page.goto('/app/events');
		await page.getByRole('link', { name: '予定を足す' }).click();
		await page.getByLabel('予定の名前').fill('時限で決めた架空の予定');
		await page.getByLabel('場所 (任意)').fill('架空の講堂');
		await page.getByLabel('開始日').fill(date);
		await page.getByRole('radio', { name: '時限で決める' }).check();
		await page.getByLabel('始まりの時限').selectOption('5');
		await page.getByLabel('終わりの時限').selectOption('5');
		await page.getByRole('button', { name: '足す' }).click();
		await expect(page.getByRole('status')).toHaveText('予定を足しました。');

		await page.goto(`/app/week?date=${date}`);
		const periodRow = page
			.getByRole('row')
			.filter({ has: page.getByRole('rowheader', { name: /^5 限/ }) });
		const eventRow = page
			.getByRole('row')
			.filter({ has: page.getByRole('rowheader', { name: '予定' }) });
		await expect(periodRow).toContainText('時限で決めた架空の予定');
		await expect(periodRow).toContainText('5 限');
		await expect(eventRow.getByText('時限で決めた架空の予定', { exact: true })).toHaveCount(0);

		// 時限の行では、行自体が時限を示すので、名前と場所の間に時限 (「5 限」) を繰り返さない
		const card = periodRow.locator('.event').filter({ hasText: '時限で決めた架空の予定' });
		await expect(card).toContainText('架空の講堂');
		await expect(card.locator('.time')).toHaveCount(0);
	});

	test('公開範囲を選べる。全体に公開した予定は、ほかの人が探して加えられ、限定公開は、リンクの値でだけ開ける', async ({
		browser,
		page,
	}) => {
		// テスト用の DB は実行をまたいで残るので、予定の名前は、実行ごとに変える
		const suffix = String(Date.now());
		const publicTitle = `全体の架空の予定${suffix}`;
		const linkTitle = `限定の架空の予定${suffix}`;
		const privateTitle = `自分だけの架空の予定${suffix}`;
		const create = async (
			target: Page,
			title: string,
			visibility: '自分だけ' | '共有のリンクを知っている人' | 'Funmary にログインしている全員',
		) => {
			await target.goto('/app/events');
			await target.getByRole('link', { name: '予定を足す' }).click();
			await expect(target.getByRole('heading', { name: '予定を足す' })).toBeVisible();
			await target.getByLabel('予定の名前').fill(title);
			await target.getByLabel('開始日').fill('2026-12-07');
			await target.getByRole('radio', { name: '終日' }).check();
			await target.getByRole('radio', { name: new RegExp(`^${visibility}`) }).check();
			await target.getByRole('button', { name: '足す' }).click();
			await expect(target.getByRole('status')).toHaveText('予定を足しました。');
		};

		await login(page, `e2e-events-owner-${Date.now()}@fun.ac.jp`);
		await create(page, publicTitle, 'Funmary にログインしている全員');
		await create(page, linkTitle, '共有のリンクを知っている人');
		await create(page, privateTitle, '自分だけ');

		// 限定公開の予定には、共有のリンクが出る。自分だけの予定には出ない
		await page
			.getByRole('listitem')
			.filter({ hasText: linkTitle })
			.getByRole('link', { name: /^編集/ })
			.click();
		const linkField = page.getByLabel('リンク', { exact: true });
		const firstLink = await linkField.inputValue();
		expect(firstLink).toMatch(/\/app\/events\/shared\/[\w-]{43}$/);
		await page.goto('/app/events');
		await page
			.getByRole('listitem')
			.filter({ hasText: privateTitle })
			.getByRole('link', { name: /^編集/ })
			.click();
		await expect(page.getByRole('heading', { name: '共有のリンク' })).toHaveCount(0);

		// ほかの人: みんなの予定には、全体の予定だけが出る。持ち主の情報は出ない
		const viewer = await (await browser.newContext()).newPage();
		await login(viewer, `e2e-events-viewer-${Date.now()}@fun.ac.jp`);
		await viewer.goto('/app/events');
		await viewer.getByRole('link', { name: 'みんなの予定を探す' }).click();
		const publicItem = viewer.getByRole('listitem').filter({ hasText: publicTitle });
		await expect(publicItem).toBeVisible();
		await expect(viewer.getByText(linkTitle)).toHaveCount(0);
		await expect(viewer.getByText(privateTitle)).toHaveCount(0);
		await expect(viewer.getByText('e2e-events-owner')).toHaveCount(0);

		// 加える。自分の予定の一覧に「加えた予定」が出る。外せる
		await publicItem.getByRole('link', { name: publicTitle }).click();
		await viewer.getByRole('button', { name: '自分の時間割に加える' }).click();
		await expect(viewer.getByRole('status')).toHaveText('自分の時間割に加えました。');
		// 加えた予定は、その日の週の時間割に出る
		await viewer.goto('/app/week?date=2026-12-07');
		const added = viewer
			.getByRole('row')
			.filter({ has: viewer.getByRole('rowheader', { name: '予定' }) });
		await expect(added).toContainText(publicTitle);
		await expect(added).toContainText('加えた予定');
		await viewer.goto('/app/events');
		await expect(viewer.getByRole('region', { name: '加えた予定' })).toContainText(publicTitle);
		await viewer
			.getByRole('region', { name: '加えた予定' })
			.getByRole('link', { name: /^開く/ })
			.click();
		await viewer.getByRole('button', { name: '自分の時間割から外す' }).click();
		await expect(viewer.getByRole('status')).toHaveText('自分の時間割から外しました。');

		// 限定公開は、リンクの値で開ける。番号では開けない。作り直すと、前のリンクは開けない
		await viewer.goto(firstLink);
		await expect(viewer.getByRole('heading', { name: linkTitle })).toBeVisible();
		expect((await viewer.goto(firstLink.replace(/[\w-]{43}$/, '1')))?.status()).toBe(404);
		await page.goto('/app/events');
		await page
			.getByRole('listitem')
			.filter({ hasText: linkTitle })
			.getByRole('link', { name: /^編集/ })
			.click();
		await page.getByRole('button', { name: 'リンクを作り直す' }).click();
		await expect(page.getByRole('status')).toContainText('共有のリンクを作り直しました');
		await expect(linkField).not.toHaveValue(firstLink);
		expect((await viewer.goto(firstLink))?.status()).toBe(404);
	});

	test('ログインしていなければ、ログインの画面に移る', async ({ page }) => {
		await page.goto('/app/events');
		await expect(page).toHaveURL('/login');
	});
});

test.describe('時間割だけの略称表示', () => {
	for (const viewport of [
		{ width: 1440, height: 900 },
		{ width: 390, height: 844 },
	]) {
		test(`${viewport.width}pxで略称を保存し、切り替えと空欄保存ができる`, async ({
			page,
		}, testInfo) => {
			await page.setViewportSize(viewport);
			const email = `e2e-abbreviation-${viewport.width}-${Date.now()}@fun.ac.jp`;
			oidc.setIdentity({ sub: email, email, email_verified: true, hd: 'fun.ac.jp' });
			await signIn(page);
			await expect(page).toHaveURL('/app');
			seedSubjects((database, subjectId) => {
				const user = database.sqlite.prepare('SELECT id FROM users WHERE email = ?').get(email) as {
					id: string;
				};
				const courses = createCourseStore(database);
				courses.register(user.id, subjectId, new Date());
				courses.addSharedSlots(
					[{ subjectId, weekday: 2, period: 3, room: '363' }],
					{ source: 'manual', createdBy: user.id },
					new Date(),
				);
			});
			await page.goto('/app/subjects/2026/900001');
			await page.getByText('略称を編集する', { exact: true }).click();
			await expect(page.getByLabel('略称名', { exact: true })).toHaveValue('');
			await page.getByLabel('略称名', { exact: true }).fill('架空演習');
			if (process.env['FUNMARY_CAPTURE_UI'] === 'true') {
				await page.screenshot({
					path: testInfo.outputPath('subject-editor.png'),
					fullPage: true,
					animations: 'disabled',
				});
			}
			await page.getByRole('button', { name: '保存する', exact: true }).click();
			await expect(page.getByRole('status')).toContainText('略称を保存しました');
			await expect(page.getByRole('heading', { level: 1 })).toHaveText('架空の演習Ⅱ1-AB');
			await page.reload();
			await page.getByText('略称を編集する', { exact: true }).click();
			await expect(page.getByLabel('略称名', { exact: true })).toHaveValue('架空演習');
			await page.goto('/app/week?date=2026-10-05');
			const toggle = page.getByRole('switch', { name: '略称表示' });
			const table = page.getByRole('table');
			await expect(toggle).not.toBeChecked();
			await expect(table.getByRole('link', { name: '架空の演習Ⅱ1-AB', exact: true })).toHaveCount(
				1,
			);
			await toggle.click();
			await expect(toggle).toBeChecked();
			await expect(table.getByRole('link', { name: '架空演習', exact: true })).toHaveCount(1);
			if (process.env['FUNMARY_CAPTURE_UI'] === 'true') {
				await page.getByRole('button', { name: '週', exact: true }).click();
				await expect(table.getByRole('link', { name: '架空演習', exact: true })).toBeVisible();
				await page.screenshot({
					path: testInfo.outputPath('timetable-light.png'),
					fullPage: true,
					animations: 'disabled',
				});
				await page
					.context()
					.addCookies([{ name: 'fm-theme', value: 'dark', url: 'http://localhost:4173' }]);
				await page.reload();
				await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
				await page.screenshot({
					path: testInfo.outputPath('timetable-dark.png'),
					fullPage: true,
					animations: 'disabled',
				});
			}
			await page.reload();
			await expect(toggle).toBeChecked();
			await expect(table.getByRole('link', { name: '架空演習', exact: true })).toHaveCount(1);
			await page.goto('/app/courses');
			await expect(page.getByRole('link', { name: '架空の演習Ⅱ1-AB', exact: true })).toBeVisible();
			await expect(page.getByRole('link', { name: '架空演習', exact: true })).toHaveCount(0);
			await page.goto('/app/week?date=2026-10-05');
			await toggle.focus();
			await page.keyboard.press('Space');
			await expect(toggle).not.toBeChecked();
			if (process.env['FUNMARY_CAPTURE_UI'] === 'true') {
				await page.screenshot({
					path: testInfo.outputPath('timetable-off.png'),
					fullPage: true,
					animations: 'disabled',
				});
			}
			await expect(table.getByRole('link', { name: '架空の演習Ⅱ1-AB', exact: true })).toHaveCount(
				1,
			);
			await page.goto('/app/subjects/2026/900001');
			await page.getByText('略称を編集する', { exact: true }).click();
			await page.getByLabel('略称名', { exact: true }).fill('');
			await page.getByRole('button', { name: '保存する', exact: true }).click();
			await expect(page.getByRole('status')).toContainText('略称を保存しました');
			await page.goto('/app/week?date=2026-10-05');
			await toggle.click();
			await expect(toggle).toBeChecked();
			await expect(table.getByRole('link', { name: '架空の演習Ⅱ1-AB', exact: true })).toHaveCount(
				1,
			);
		});
	}

	for (const width of [320, 360]) {
		test(`${width}pxでも略称表示の操作部が画面内に収まる`, async ({ page }, testInfo) => {
			await page.setViewportSize({ width, height: 844 });
			const email = `e2e-abbreviation-narrow-${width}-${Date.now()}@fun.ac.jp`;
			oidc.setIdentity({ sub: email, email, email_verified: true, hd: 'fun.ac.jp' });
			await signIn(page);
			await page.goto('/app/week?date=2026-10-05');
			await expect(page.getByRole('switch', { name: '略称表示' })).toBeVisible();
			await expect
				.poll(() =>
					page
						.getByRole('group', { name: '時間割の見せ方' })
						.evaluate((element) => element.scrollWidth),
				)
				.toBeLessThanOrEqual(width - 32);
			await page.getByRole('switch', { name: '略称表示' }).click();
			await expect(page.getByRole('switch', { name: '略称表示' })).toBeChecked();
			if (process.env['FUNMARY_CAPTURE_UI'] === 'true') {
				await page.screenshot({
					path: testInfo.outputPath('narrow-toolbar.png'),
					fullPage: true,
					animations: 'disabled',
				});
			}
		});
	}

	test('同じ科目の略称は利用者間で共有されず、不正な入力は保存されない', async ({
		page,
		browser,
	}) => {
		const stamp = Date.now();
		const login = async (target: import('@playwright/test').Page, suffix: string) => {
			const email = `e2e-abbreviation-${stamp}-${suffix}@fun.ac.jp`;
			oidc.setIdentity({ sub: email, email, email_verified: true, hd: 'fun.ac.jp' });
			await signIn(target);
			await expect(target).toHaveURL('/app');
			seedSubjects((database, subjectId) => {
				const user = database.sqlite.prepare('SELECT id FROM users WHERE email = ?').get(email) as {
					id: string;
				};
				createCourseStore(database).register(user.id, subjectId, new Date());
			});
		};
		const otherContext = await browser.newContext();
		try {
			const other = await otherContext.newPage();
			await login(page, 'a');
			await login(other, 'b');
			await page.goto('/app/subjects/2026/900001');
			await page.getByText('略称を編集する', { exact: true }).click();
			await page.getByLabel('略称名', { exact: true }).fill('自分だけの演習');
			await page.getByRole('button', { name: '保存する', exact: true }).click();
			await expect(page.getByRole('status')).toContainText('略称を保存しました');
			await other.goto('/app/subjects/2026/900001');
			await other.getByText('略称を編集する', { exact: true }).click();
			await expect(other.getByLabel('略称名', { exact: true })).toHaveValue('');
			await other.goto('/app/week?date=2026-10-05');
			await other.getByRole('switch', { name: '略称表示' }).click();
			await expect(
				other.getByRole('table').getByRole('link', { name: '架空の演習Ⅱ1-AB', exact: true }),
			).toHaveCount(1);
			await expect(other.getByText('自分だけの演習', { exact: true })).toHaveCount(0);
			const invalid = await page.request.post('/app/subjects/2026/900001?/saveAbbreviation', {
				headers: { origin: 'http://localhost:4173' },
				form: { abbreviation: 'あ'.repeat(101) },
			});
			expect(invalid.status()).toBe(400);
			await page.reload();
			await page.getByText('略称を編集する', { exact: true }).click();
			await expect(page.getByLabel('略称名', { exact: true })).toHaveValue('自分だけの演習');
		} finally {
			await otherContext.close();
		}
	});
});
