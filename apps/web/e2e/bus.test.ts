// バスの時刻表の画面。時刻表は、取り込みの定期処理の代わりに、テストが DB に直接入れる。
import { expect, test } from '@playwright/test';
import { oidc, seedBus, signInAs, useMockOidc } from './support.ts';

// サーバーの状態 (次にログインする人) を共有するので、テストは 1 つずつ動かす
test.describe.configure({ mode: 'serial' });
useMockOidc();

test.describe('バス', () => {
	const email = `e2e-bus-${Date.now()}@fun.ac.jp`;

	test.beforeAll(() => {
		seedBus();
	});

	test('メニューにバスが出る。選んだバス停から未来大へ向かう便だけが、到着の時刻つきで出る', async ({
		page,
	}) => {
		await signInAs(page, email);
		await page.getByRole('link', { name: 'バス', exact: true }).first().click();
		await expect(page.getByRole('heading', { level: 1, name: 'バス' })).toBeVisible();

		await expect(page.getByRole('link', { name: /出発.*函館駅前/ })).toBeVisible();
		const rows = page.getByRole('listitem').filter({ hasText: '55A' });
		await expect(rows.first()).toContainText('赤川行き');
		await expect(rows.first()).toContainText('函館駅前 - はこだて未来大学');
		// 到着の時刻 (出発の 15 分後。未来大の発車表の同じ行き先の便) が付く
		await expect(rows.first()).toContainText('→');
		// 反対向き (千代台行き) は出ない
		await expect(page.getByText('千代台行き')).toHaveCount(0);
		// 現在地から向きを決めるボタンが出ている
		await expect(page.getByRole('button', { name: '現在地から向きを決める' })).toBeVisible();
	});

	test('向きを入れ替えると、URL は変えずに、未来大から出る便になる。向きは覚えない', async ({
		page,
	}) => {
		await signInAs(page, email);
		await page.goto('/app/bus');
		await page.getByRole('button', { name: /向きを入れ替える/ }).click();
		await expect(page).toHaveURL(/\/app\/bus$/);
		await expect(page.getByRole('link', { name: /到着.*函館駅前/ })).toBeVisible();
		const rows = page.getByRole('listitem').filter({ hasText: '55A' });
		await expect(rows.first()).toContainText('千代台行き');
		await expect(rows.first()).toContainText('はこだて未来大学 - 函館駅前');

		// 開き直すと、未来大へ向かう向きに戻る (学内の Wi-Fi でなければ)
		await page.goto('/app/bus');
		await expect(page.getByRole('link', { name: /出発.*函館駅前/ })).toBeVisible();
	});

	test('バス停の選択の画面から、バス停を選ぶと、バスの画面に戻る。次に開いても同じバス停', async ({
		page,
	}) => {
		await signInAs(page, email);
		await page.goto('/app/bus');
		await page.getByRole('link', { name: /出発.*函館駅前/ }).click();
		await expect(page.getByRole('heading', { level: 1, name: 'バス停選択' })).toBeVisible();
		// 未来大そのものは選べない
		await expect(page.getByRole('button', { name: 'はこだて未来大学' })).toHaveCount(0);
		await page.getByRole('button', { name: '函館駅前' }).click();
		await expect(page).toHaveURL(/\/app\/bus$/);
		await page.reload();
		await expect(page.getByRole('link', { name: /出発.*函館駅前/ })).toBeVisible();
	});

	test('長いバス停名を選んでも、画面の横幅を超えない', async ({ page }) => {
		await page.setViewportSize({ width: 840, height: 900 });
		await signInAs(page, email);
		await page.goto('/app/bus');
		await page.getByRole('link', { name: /出発.*函館駅前/ }).click();
		await page.getByRole('button', { name: '赤川１丁目ライフプレステージ白ゆり美原前' }).click();

		await expect(
			page.getByRole('link', { name: /出発.*赤川１丁目ライフプレステージ白ゆり美原前/ }),
		).toBeVisible();
		const main = page.getByRole('main');
		await expect(main).toHaveJSProperty(
			'scrollWidth',
			await main.evaluate((element) => element.clientWidth),
		);
	});

	test('デスクトップでは、次のバスと経路を横に並べ、その下に時刻表を出す', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await signInAs(page, email);
		await page.goto('/app/bus');

		const nextBus = await page.getByRole('region', { name: '次のバス' }).boundingBox();
		const route = await page.getByRole('region', { name: '経路' }).boundingBox();
		const timetable = await page.getByRole('region', { name: '時刻表' }).boundingBox();
		expect(nextBus).not.toBeNull();
		expect(route).not.toBeNull();
		expect(timetable).not.toBeNull();
		expect(nextBus!.x + nextBus!.width).toBeLessThanOrEqual(route!.x);
		expect(timetable!.y).toBeGreaterThanOrEqual(
			Math.max(nextBus!.y + nextBus!.height, route!.y + route!.height),
		);
	});

	test('デスクトップでは、画面全体ではなく便の一覧の中だけがスクロールする', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await signInAs(page, email);
		await page.goto('/app/bus');

		const departures = page.getByRole('list', { name: '函館駅前からはこだて未来大学への発車' });
		await expect(departures).toBeVisible();
		const list = await departures.evaluate((element) => ({
			scrollHeight: element.scrollHeight,
			clientHeight: element.clientHeight,
		}));
		expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
		const main = page.getByRole('main');
		await expect(main).toHaveJSProperty(
			'scrollHeight',
			await main.evaluate((element) => element.clientHeight),
		);
	});

	test('一覧が広いときは各便を 1 行に並べ、到着時刻の有無にかかわらず列を揃える', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await signInAs(page, email);
		await page.goto('/app/bus');

		const rows = page
			.getByRole('list', { name: '函館駅前からはこだて未来大学への発車' })
			.getByRole('listitem');
		await expect(rows.filter({ hasText: '→' })).not.toHaveCount(0);
		await expect(rows.filter({ hasNotText: '→' })).not.toHaveCount(0);
		const routes = rows.getByText('55A', { exact: true });
		const sections = rows.getByText('函館駅前 - はこだて未来大学', { exact: true });
		const firstRoute = await routes.first().boundingBox();
		const firstSection = await sections.first().boundingBox();
		expect(firstRoute).not.toBeNull();
		expect(firstSection).not.toBeNull();
		// 文字の大きさが違うので、上端ではなく、縦の範囲が重なる (同じ行にある) ことを確かめる
		expect(firstSection!.y).toBeLessThan(firstRoute!.y + firstRoute!.height);
		expect(firstRoute!.y).toBeLessThan(firstSection!.y + firstSection!.height);
		for (const column of [routes, sections]) {
			const positions = await column.evaluateAll((elements) =>
				elements.map((element) => element.getBoundingClientRect().x),
			);
			expect(Math.max(...positions) - Math.min(...positions)).toBeLessThanOrEqual(1);
		}
	});

	test('一覧が狭いときは、スマホと同じく各便を縦に並べ、横にはみ出さない', async ({ page }) => {
		await signInAs(page, email);
		for (const width of [390, 880]) {
			await page.setViewportSize({ width, height: 900 });
			await page.goto('/app/bus');
			const row = page
				.getByRole('list', { name: '函館駅前からはこだて未来大学への発車' })
				.getByRole('listitem')
				.first();
			const route = await row.getByText('55A', { exact: true }).boundingBox();
			const section = await row
				.getByText('函館駅前 - はこだて未来大学', { exact: true })
				.boundingBox();
			expect(route).not.toBeNull();
			expect(section).not.toBeNull();
			expect(section!.y).toBeGreaterThanOrEqual(route!.y + route!.height - 1);
			const main = page.getByRole('main');
			await expect(main).toHaveJSProperty(
				'scrollWidth',
				await main.evaluate((element) => element.clientWidth),
			);
		}
	});

	test('次のバスは向きと選択中のダイヤ区分に合わせて案内を変える', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await signInAs(page, email);
		await page.goto('/app/bus');

		const nextBus = page.getByRole('region', { name: '次のバス' });
		await expect(nextBus).toContainText('函館駅前 → はこだて未来大学');
		await page.getByRole('button', { name: /向きを入れ替える/ }).click();
		await expect(nextBus).toContainText('はこだて未来大学 → 函館駅前');

		const today = page.getByRole('button', { name: /\(今日\)/ });
		const otherDayLabel = (
			await page.getByRole('button', { name: /^(平日|休日)/ }).allTextContents()
		).find((label) => !label.includes('(今日)'));
		if (!otherDayLabel) throw new Error('今日以外のダイヤ区分がありません');
		await page.getByRole('button', { name: otherDayLabel.trim(), exact: true }).click();
		await expect(today).toBeVisible();
		await expect(nextBus).toContainText(
			`${otherDayLabel.includes('平日') ? '平日' : '休日'}ダイヤ`,
		);
	});

	test('今日の最終便のあとは、次のバスの欄に翌日の便を出さない', async ({ page }) => {
		// 0 時の 1 便だけにすると、今日の便は発車し終わり、これからの便は翌日の 0 時だけになる
		seedBus({ times: ['00:00'] });
		try {
			await page.setViewportSize({ width: 1440, height: 900 });
			await signInAs(page, email);
			await page.goto('/app/bus');

			const nextBus = page.getByRole('region', { name: '次のバス' });
			await expect(nextBus).toContainText('今日の発車は、もうありません');
			await expect(nextBus).not.toContainText('55A');
		} finally {
			seedBus();
		}
	});

	test('スマホでは、次のバスの欄を出さない', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await signInAs(page, email);
		await page.goto('/app/bus');

		await expect(
			page.getByRole('list', { name: '函館駅前からはこだて未来大学への発車' }),
		).toBeVisible();
		await expect(page.getByRole('region', { name: '次のバス' })).toBeHidden();
	});

	test('平日と休日を、URL は変えずに切り替えられ、その日のうちは覚える。今日の区分には (今日) が付く', async ({
		page,
	}) => {
		await signInAs(page, email);
		await page.goto('/app/bus');
		await expect(page.getByRole('button', { name: /\(今日\)/ })).toBeVisible();
		await page.getByRole('button', { name: /^休日/ }).click();
		await expect(page.getByRole('button', { name: /^休日/ })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		await expect(page).toHaveURL(/\/app\/bus$/);

		await page.reload();
		await expect(page.getByRole('button', { name: /^休日/ })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
	});

	test('ホームに、次のバスが出る。押すとバスの画面に行く', async ({ page }) => {
		await signInAs(page, email);
		await page.goto('/app');
		const section = page.getByRole('region', { name: '次のバス' });
		// 取り込んだ時刻表の終わりに近い時刻でも、乗る停留所と降りる停留所は出る
		await expect(section).toContainText('函館駅前 → はこだて未来大学');
		await section.getByRole('link').click();
		await expect(page.getByRole('heading', { level: 1, name: 'バス' })).toBeVisible();
	});

	test('ホームを開いたままでも、1 分ごとに次のバスを読み直す', async ({ page }) => {
		await page.clock.install();
		await signInAs(page, email);
		await page.goto('/app');
		const section = page.getByRole('region', { name: '次のバス' });
		await expect(section).toContainText('55A');

		// 開いている間に時刻表が変わったことにして、読み直したら新しい系統が出ることで確かめる
		seedBus({ route: '99Z' });
		try {
			await page.clock.runFor('01:00');
			await expect(section).toContainText('99Z');
		} finally {
			seedBus();
		}
	});

	test.describe('現在地が許可されているとき', () => {
		// 未来大の座標 (campus.ts の UNIVERSITY_LOCATION) の近く
		test.describe('未来大の近く', () => {
			test.use({
				permissions: ['geolocation'],
				geolocation: { latitude: 41.8421, longitude: 140.767 },
			});

			test('ホームの次のバスは、未来大から出る向きになる', async ({ page }) => {
				await signInAs(page, email);
				await page.goto('/app');
				await expect(page.getByRole('region', { name: '次のバス' })).toContainText(
					'はこだて未来大学 → 函館駅前',
				);
			});

			test('バスの画面も、未来大から出る向きになる', async ({ page }) => {
				await signInAs(page, email);
				await page.goto('/app/bus');
				await expect(page.getByRole('link', { name: /到着.*函館駅前/ })).toBeVisible();
			});
		});

		// 函館駅の近く
		test.describe('未来大から離れている', () => {
			test.use({
				permissions: ['geolocation'],
				geolocation: { latitude: 41.7737, longitude: 140.7266 },
			});

			test('ホームの次のバスは、未来大へ向かう向きになる', async ({ page }) => {
				await signInAs(page, email);
				await page.goto('/app');
				await expect(page.getByRole('region', { name: '次のバス' })).toContainText(
					'函館駅前 → はこだて未来大学',
				);
			});
		});
	});

	test('ログインしていなければ、バスの画面は開けない', async ({ page }) => {
		oidc.setIdentity({ sub: 'nobody', email: 'nobody@fun.ac.jp', email_verified: true });
		await page.context().clearCookies();
		await page.goto('/app/bus');
		await expect(page).not.toHaveURL(/\/app\/bus/);
	});
});
