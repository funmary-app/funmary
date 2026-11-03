// 週の時間割の、画像 (PNG と PDF) への書き出し。
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createCourseStore, createSubjectStore } from '@funmary/db';
import { oidc, signIn, useMockOidc, seedSubjects } from './support.ts';

useMockOidc();

test.describe('週の時間割の画像への書き出し', () => {
	// 手元では DB がテストのたびに消えないので、利用者を毎回変える
	const sub = `e2e-week-export-${Date.now()}`;
	const email = `${sub}@fun.ac.jp`;

	const loginAs = async (page: Page) => {
		await oidc.setIdentity({ sub, email, email_verified: true, hd: 'fun.ac.jp' });
		await signIn(page);
		await expect(page).toHaveURL('/app');
	};

	let registered = false;

	/** ログインした利用者に、架空の科目を履修登録し、火曜 3 限の枠を入れる (1 回だけ) */
	const registerSubject = () => {
		if (registered) return;
		registered = true;
		seedSubjects((database) => {
			const subjectId = createSubjectStore(database).upsert(
				{
					academicYear: 2026,
					syllabusId: '900101',
					name: '架空の画像演習',
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
		});
	};

	/** 授業のある週 (2026-10-05 からの週) の時間割を開き、授業が出ていることを確かめてから、画像で保存のダイアログを開く */
	const openExportDialog = async (page: Page) => {
		await page.goto('/app/week?date=2026-10-07');
		await expect(page.getByRole('link', { name: /架空の画像演習/ })).toBeVisible();
		await page.getByRole('button', { name: '週の時間割を画像で保存' }).click();
		await expect(page.getByRole('alertdialog', { name: '週の時間割を画像で保存' })).toBeVisible();
	};

	test('PNG で、正方形の大きさで保存できる', async ({ page }) => {
		await loginAs(page);
		registerSubject();
		await openExportDialog(page);
		await page.getByText('正方形 (1080 x 1080)').click();
		const downloading = page.waitForEvent('download');
		await page.getByRole('button', { name: '保存する' }).click();
		const download = await downloading;
		expect(download.suggestedFilename()).toMatch(/^funmary-week-\d{4}-\d{2}-\d{2}-square\.png$/);
		const bytes = await readFile(await download.path());
		expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
		// PNG の先頭の寸法 (IHDR) が、選んだ大きさになっている
		expect(bytes.readUInt32BE(16)).toBe(1080);
		expect(bytes.readUInt32BE(20)).toBe(1080);
	});

	test('ダークの画面でも、PDF (A4 横) で保存できる', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'dark' });
		await loginAs(page);
		registerSubject();
		await openExportDialog(page);
		await page.getByText('PDF', { exact: true }).click();
		await page.getByText('A4 横 (3508 x 2480)').click();
		const downloading = page.waitForEvent('download');
		await page.getByRole('button', { name: '保存する' }).click();
		const download = await downloading;
		expect(download.suggestedFilename()).toMatch(/^funmary-week-\d{4}-\d{2}-\d{2}-a4\.pdf$/);
		const bytes = await readFile(await download.path());
		expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
		expect(bytes.toString('latin1')).toContain('/MediaBox [0 0 841.92 595.2]');
	});
});
