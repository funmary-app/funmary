// 履修科目の画面に出す、次の学期の履修登録の案内。前期か後期が始まる 14 日前から終わりまでの間で、
// その学期の科目を 1 つも履修していなければ出す (登録を忘れると、時間割に授業が出ないため)
import {
	SEMESTER_TERMS,
	academicYearOf,
	semesterForRegistration,
	type CalendarDate,
	type TermPeriod,
} from '@funmary/core';

/** 学期が始まる何日前から案内するか */
const LEAD_DAYS = 14;

const SEMESTER_LABELS = { spring: '前期', fall: '後期' } as const;

/**
 * @param terms 学期の期間。3 月に 4 月からの前期を案内できるよう、今年度と次の年度の分を渡す
 * @param registered 履修している科目の年度と学期
 */
export function termRegistrationReminder(
	terms: readonly TermPeriod[],
	today: CalendarDate,
	registered: readonly { readonly academicYear: number; readonly term: string }[],
): { label: string; start: CalendarDate; started: boolean } | null {
	const semester = semesterForRegistration(terms, today, LEAD_DAYS);
	if (!semester) return null;
	const academicYear = academicYearOf(semester.start);
	const covered: readonly string[] = SEMESTER_TERMS[semester.term];
	if (
		registered.some(
			(subject) => subject.academicYear === academicYear && covered.includes(subject.term),
		)
	) {
		return null;
	}
	return {
		label: `${academicYear} 年度${SEMESTER_LABELS[semester.term]}`,
		start: semester.start,
		started: semester.start <= today,
	};
}
