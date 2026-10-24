// 前期か後期が始まったときに、その学期の科目を 1 つも履修していない人の通知欄に、履修登録を促す知らせを入れる定期処理。
// 登録を忘れていると、時間割とカレンダーに、その学期の授業が出ないため。
// 学期の期間は学年暦の取り込みの結果 (なければ推定) から決める。動けなかった日があっても拾えるよう、始まって 7 日のうちは毎日見る
import {
	SEMESTER_TERMS,
	academicYearOf,
	jstDateTime,
	semesterJustStarted,
	type TermPeriod,
} from '@funmary/core';
import type { JobDefinition } from './runner.ts';

/** 学期が始まってから、知らせを入れる日数 */
const NOTIFY_DAYS = 7;

const SEMESTER_LABELS = { spring: '前期', fall: '後期' } as const;

export interface TermRegistrationNotification {
	readonly userId: string;
	readonly kind: 'termStart';
	readonly title: string;
	readonly body: string;
	readonly link: string;
	readonly subjectId: null;
	readonly dedupeKey: string;
}

export interface RemindTermRegistrationDeps {
	/** その年度の学期の期間 */
	readonly terms: (academicYear: number) => readonly TermPeriod[];
	readonly usersWithoutRegistrationIn: (
		academicYear: number,
		terms: readonly string[],
	) => readonly string[];
	/** 足した通知の ID を返す (二重のものは足さない) */
	readonly insert: (
		entries: readonly TermRegistrationNotification[],
		now: Date,
	) => readonly number[];
}

export function createRemindTermRegistrationJob(deps: RemindTermRegistrationDeps): JobDefinition {
	return {
		name: 'remind-term-registration',
		// 日本時間の毎朝 8 時台
		schedule: '10 8 * * *',
		timeoutMs: 60 * 1000,
		quietWhenIdle: true,
		run({ now }) {
			const at = now();
			const today = jstDateTime(at).date;
			const academicYear = academicYearOf(today);
			const semester = semesterJustStarted(deps.terms(academicYear), today, NOTIFY_DAYS);
			if (!semester) return Promise.resolve(undefined);
			const label = `${academicYear} 年度${SEMESTER_LABELS[semester.term]}`;
			const entries = deps
				.usersWithoutRegistrationIn(academicYear, SEMESTER_TERMS[semester.term])
				.map((userId): TermRegistrationNotification => ({
					userId,
					kind: 'termStart',
					title: `${label}の授業が始まりました。履修科目を登録しましょう`,
					body: '履修科目を登録すると、時間割とカレンダーに授業が出て、休講などが届きます。',
					link: '/app/courses',
					subjectId: null,
					dedupeKey: `term-start:${academicYear}-${semester.term}`,
				}));
			const inserted = deps.insert(entries, at);
			return Promise.resolve(
				inserted.length > 0
					? `${SEMESTER_LABELS[semester.term]}の履修登録を促す通知を ${inserted.length} 件足しました`
					: undefined,
			);
		},
	};
}
