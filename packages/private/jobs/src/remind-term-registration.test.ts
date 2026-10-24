import { createLogger } from '@funmary/log';
import { resolveAcademicTerms } from '@funmary/core';
import { describe, expect, it } from 'vitest';
import {
	createRemindTermRegistrationJob,
	type TermRegistrationNotification,
} from './remind-term-registration.ts';
import type { JobContext } from './runner.ts';

function setup(now: string) {
	const inserted: TermRegistrationNotification[] = [];
	const asked: { academicYear: number; terms: readonly string[] }[] = [];
	const job = createRemindTermRegistrationJob({
		terms: (academicYear) =>
			resolveAcademicTerms(academicYear, [
				{ term: 'fall', start: '2026-09-24', end: '2027-01-31', source: 'auto' },
			]),
		usersWithoutRegistrationIn: (academicYear, terms) => {
			asked.push({ academicYear, terms });
			return ['alice', 'bob'];
		},
		insert: (entries) => {
			inserted.push(...entries);
			return entries.map((_, index) => index + 1);
		},
	});
	const context: JobContext = {
		signal: new AbortController().signal,
		now: () => new Date(now),
		log: createLogger({ level: 'error', format: 'text', mode: 'development' }),
	};
	return { job, context, inserted, asked };
}

describe('履修登録を促す知らせ', () => {
	it('後期が始まって 7 日のうちなら、後期の科目を履修していない人の通知欄に、履修科目の画面へのリンクを入れる', async () => {
		// 日本時間の 2026-09-26 9 時
		const { job, context, inserted, asked } = setup('2026-09-26T00:00:00Z');
		expect(await job.run(context)).toBe('後期の履修登録を促す通知を 2 件足しました');
		expect(asked).toEqual([{ academicYear: 2026, terms: ['full-year', 'fall', 'q3', 'q4'] }]);
		expect(inserted).toEqual([
			expect.objectContaining({
				userId: 'alice',
				kind: 'termStart',
				title: '2026 年度後期の授業が始まりました。履修科目を登録しましょう',
				link: '/app/courses',
				subjectId: null,
				dedupeKey: 'term-start:2026-fall',
			}),
			expect.objectContaining({ userId: 'bob', dedupeKey: 'term-start:2026-fall' }),
		]);
	});

	it('前期は、その年度の 4 月の始まりに知らせる', async () => {
		const { job, context, inserted } = setup('2027-04-01T00:00:00Z');
		await job.run(context);
		expect(inserted[0]).toMatchObject({
			title: '2027 年度前期の授業が始まりました。履修科目を登録しましょう',
			dedupeKey: 'term-start:2027-spring',
		});
	});

	it('学期が始まって 7 日を過ぎたら、何もしない', async () => {
		const { job, context, inserted, asked } = setup('2026-10-01T00:00:00Z');
		expect(await job.run(context)).toBeUndefined();
		expect(asked).toEqual([]);
		expect(inserted).toEqual([]);
	});
});
