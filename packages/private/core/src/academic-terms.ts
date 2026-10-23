// 学期の期間の決め方。値は、管理者が入れた値、学年暦から取った値、既定の規則による推定の順に探す。
// 規則で推定するのは前期と後期だけ。1Q と 2Q は前期、3Q と 4Q は後期の推定の期間をそのまま使う。
// 通年は、前期の始まりから後期の終わりまで。集中講義は、保存された値があるときだけ使う。
// I/O は持たない。保存された値は引数で受け取る。
import { addDays, isoWeekday, type CalendarDate } from './calendar-date.ts';
import type { Term, TermPeriod } from './timetable.ts';

/** 値の出どころ。auto は大学の学年暦から自動で取った値、manual は管理画面での入力、estimated は規則による推定 */
export type TermSource = 'auto' | 'manual' | 'estimated';

export interface StoredTerm extends TermPeriod {
	readonly source: Exclude<TermSource, 'estimated'>;
}

export interface ResolvedTerm extends TermPeriod {
	readonly source: TermSource;
}

/** 9 月の第 3 月曜日 (第 3 週の月曜日) */
function thirdMondayOfSeptember(year: number): CalendarDate {
	const first = `${String(year).padStart(4, '0')}-09-01`;
	return addDays(first, ((8 - isoWeekday(first)) % 7) + 14);
}

/**
 * 既定の規則による、前期と後期の期間 (作者が決めた仮の規則)。
 * 前期は 4/1 から 7/31、後期は 9 月の第 3 月曜日から翌年の 1/31 までとする。
 * 大学の学年暦の授業期間より広めなので、推定の間は、管理画面と管理用の通知で入力を促す。
 */
export function estimateAcademicTerms(academicYear: number): TermPeriod[] {
	const year = String(academicYear).padStart(4, '0');
	const nextYear = String(academicYear + 1).padStart(4, '0');
	return [
		{ term: 'spring', start: `${year}-04-01`, end: `${year}-07-31` },
		{ term: 'fall', start: thirdMondayOfSeptember(academicYear), end: `${nextYear}-01-31` },
	];
}

const ESTIMATED_TERMS: readonly Term[] = ['spring', 'fall'];

/** クォーターと、それを含む学期 */
const QUARTER_SEMESTERS: readonly (readonly [Term, Term])[] = [
	['q1', 'spring'],
	['q2', 'spring'],
	['q3', 'fall'],
	['q4', 'fall'],
];

/** 同じ学期に複数の値があるとき、手入力を先に使う。管理者が、取得した値の誤りを直せるようにするため */
const SOURCE_PRIORITY: Record<StoredTerm['source'], number> = { manual: 0, auto: 1 };

export function resolveAcademicTerms(
	academicYear: number,
	stored: readonly StoredTerm[],
): ResolvedTerm[] {
	const byTerm = new Map<Term, ResolvedTerm>();
	for (const item of [...stored].sort(
		(a, b) => SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source],
	)) {
		// 優先度の低い順に入れて、あとから優先度の高いもので上書きする
		byTerm.set(item.term, item);
	}
	for (const estimate of estimateAcademicTerms(academicYear)) {
		if (ESTIMATED_TERMS.includes(estimate.term) && !byTerm.has(estimate.term)) {
			byTerm.set(estimate.term, { ...estimate, source: 'estimated' });
		}
	}
	// クォーターの期間がなければ、それを含む前期か後期の期間をそのまま使う (作者の判断)
	for (const [quarter, semester] of QUARTER_SEMESTERS) {
		const period = byTerm.get(semester);
		if (period && !byTerm.has(quarter)) {
			byTerm.set(quarter, {
				term: quarter,
				start: period.start,
				end: period.end,
				source: 'estimated',
			});
		}
	}
	// 通年は、前期の始まりから後期の終わりまでを使う。期間がないと、通年の授業が時間割のどの日にも出ない
	const spring = byTerm.get('spring');
	const fall = byTerm.get('fall');
	if (spring && fall && !byTerm.has('full-year')) {
		byTerm.set('full-year', {
			term: 'full-year',
			start: spring.start,
			end: fall.end,
			source: 'estimated',
		});
	}
	// 開始日の順。同じ日に始まるものは、終わりが遅い (期間が長い) 方を先にする
	return [...byTerm.values()].sort((a, b) =>
		a.start !== b.start ? (a.start < b.start ? -1 : 1) : a.end < b.end ? 1 : a.end > b.end ? -1 : 0,
	);
}

/** その日を期間に含む学期 */
export function termsOn(terms: readonly TermPeriod[], date: CalendarDate): Term[] {
	return terms.filter((term) => term.start <= date && date <= term.end).map((term) => term.term);
}

export type Semester = 'spring' | 'fall';

/** 前期と後期に行われうる学期 (通年とクォーターを含む) */
export const SEMESTER_TERMS: Record<Semester, readonly Term[]> = {
	spring: ['full-year', 'spring', 'q1', 'q2'],
	fall: ['full-year', 'fall', 'q3', 'q4'],
};

const isSemester = (period: TermPeriod): period is TermPeriod & { term: Semester } =>
	period.term === 'spring' || period.term === 'fall';

/** 始まって days 日のうち (始まりの日を 1 日目とする) の前期か後期。なければ null */
export function semesterJustStarted(
	terms: readonly TermPeriod[],
	today: CalendarDate,
	days: number,
): (TermPeriod & { term: Semester }) | null {
	return (
		terms
			.filter(isSemester)
			.find((term) => term.start <= today && today <= addDays(term.start, days - 1)) ?? null
	);
}

/** 履修登録を促す前期か後期。始まる leadDays 日前から、終わりの日までの間なら、その学期 */
export function semesterForRegistration(
	terms: readonly TermPeriod[],
	today: CalendarDate,
	leadDays: number,
): (TermPeriod & { term: Semester }) | null {
	return (
		terms
			.filter(isSemester)
			.find((term) => addDays(term.start, -leadDays) <= today && today <= term.end) ?? null
	);
}
