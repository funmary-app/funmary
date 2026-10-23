// 休講、補講、教室変更の一覧。
import { expect, test } from '@playwright/test';
import { addDays, jstDateTime } from '@funmary/core';
import { createCourseStore, createSubjectStore } from '@funmary/db';
import { oidc, signIn, useMockOidc, seedSubjects } from './support.ts';
import { formatDate } from '../src/lib/timetable-label.ts';

useMockOidc();

test.describe('休講、補講、教室変更の一覧', () => {
	// 手元では DB が残るので、利用者を毎回変える
	const sub = `e2e-changes-${Date.now()}`;
	const email = `${sub}@fun.ac.jp`;
	const today = jstDateTime(new Date()).date;

	/** 履修する科目と、履修しない科目に、これからの休講などと過ぎた補講を入れる */
	const seedChanges = () =>
		seedSubjects((database) => {
			const subjects = createSubjectStore(database);
			const subject = (syllabusId: string, name: string) =>
				subjects.upsert(
					{
						academicYear: 2026,
						syllabusId,
						name,
						teacher: null,
						credits: 2,
						term: 'fall',
						attributes: {},
						syllabus: {},
						syllabusUrl: null,
					},
					new Date(),
				);
			const mine = subject('900006', '架空の休講演習');
			const other = subject('900007', '架空のほかの休講演習');
			const user = database.sqlite.prepare('SELECT id FROM users WHERE email = ?').get(email) as {
				id: string;
			};
			createCourseStore(database).register(user.id, mine, new Date());
			const insert = database.sqlite.prepare(
				`INSERT INTO class_changes
					(kind, subject_id, lesson_name, date, period, room, from_room, comment, makeup_plan, first_seen_at, last_seen_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
					ON CONFLICT DO UPDATE SET subject_id = excluded.subject_id`,
			);
			insert.run(
				'cancellation',
				mine,
				'架空の休講演習',
				addDays(today, 1),
				2,
				null,
				null,
				'教員の出張のため',
				'planned',
			);
			insert.run(
				'roomChange',
				other,
				'架空のほかの休講演習',
				addDays(today, 2),
				3,
				'講堂',
				'363',
				null,
				null,
			);
			insert.run('makeup', mine, '架空の休講演習', addDays(today, -3), 5, '495', null, null, null);
		});

	test('自分の履修科目のこれからの休講などを日付の順に出し、全体と過ぎた分に切り替えられる', async ({
		page,
	}) => {
		await oidc.setIdentity({ sub, email, email_verified: true, hd: 'fun.ac.jp' });
		await signIn(page);
		await expect(page).toHaveURL('/app');
		seedChanges();

		// ホームから移れる
		await page.goto('/app');
		await page.getByRole('link', { name: '休講、補講、教室変更の一覧' }).click();
		await expect(page).toHaveURL('/app/changes');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('休講、補講、教室変更');
		await expect(page.getByText(/^休講情報/)).toBeVisible();

		const tomorrow = page.getByRole('region', { name: formatDate(addDays(today, 1)) });
		await expect(tomorrow).toContainText('2 限');
		await expect(tomorrow).toContainText('休講');
		await expect(tomorrow).toContainText('補講あり');
		await expect(tomorrow).toContainText('教員の出張のため');
		const main = page.getByRole('main');
		await expect(main).not.toContainText('架空のほかの休講演習');
		await expect(main).not.toContainText('495');

		// 全体に切り替えると、履修していない科目の分も出る
		await page.getByRole('link', { name: '全体', exact: true }).click();
		await expect(page).toHaveURL('/app/changes?scope=all');
		const later = page.getByRole('region', { name: formatDate(addDays(today, 2)) });
		await expect(later).toContainText('架空のほかの休講演習');
		await expect(later).toContainText('363 から 講堂 へ');

		// 過ぎた分に切り替えると、全体のまま、過ぎた補講が出る
		await page.getByRole('link', { name: '過ぎた分', exact: true }).click();
		await expect(page).toHaveURL('/app/changes?scope=all&when=past');
		const past = page.getByRole('region', { name: formatDate(addDays(today, -3)) });
		await expect(past).toContainText('補講');
		await expect(past).toContainText('495');

		// 行を押すと、その授業の詳細を開く
		await past.getByRole('link', { name: '架空の休講演習' }).click();
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('架空の休講演習');
	});
});
