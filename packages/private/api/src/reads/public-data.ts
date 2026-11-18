// 公開 API、MCP、Discord のスラッシュコマンドが共有する、読み取りの形。
// 授業、休講日、履修科目、学年暦などの読み取り処理を共通にし、呼び出し元によって結果が変わらないようにする。
import {
	DEFAULT_PERIODS,
	academicYearOf,
	addDays,
	findNextLesson,
	findPeriod,
	isoWeekday,
	jstDateTime,
	resolveAcademicTerms,
	resolveHolidays,
	type CalendarDate,
	type Period,
} from '@funmary/core';
import type { AcademicCalendarStore, HolidayStore, SubjectStore } from '@funmary/db';
import {
	buildUserTimetable,
	type DayNote,
	type TimetableLesson,
	type TimetableSources,
} from './user-timetable.ts';

/** 次の授業を探す日数。長い休みの間は見つからなくてよい */
const NEXT_LESSON_LOOKAHEAD_DAYS = 14;

/** 授業の状態。normal は、変更のないふつうの授業 */
export const LESSON_STATUSES = ['normal', 'cancelled', 'makeup', 'roomChanged'] as const;

export interface PublicLesson extends TimetableLesson {
	/** 日本時間の "HH:MM"。時限の時刻が分からなければ null */
	readonly start: string | null;
	readonly end: string | null;
}

/** 授業の有無に関わる、その日の事情 */
export type PublicDay =
	| { readonly date: CalendarDate; readonly kind: 'substitute'; readonly weekday: number }
	| { readonly date: CalendarDate; readonly kind: 'noClass'; readonly label: string | null }
	| { readonly date: CalendarDate; readonly kind: 'holiday'; readonly name: string };

export interface PublicTimetable {
	readonly lessons: readonly PublicLesson[];
	/** 授業の日の置き換え (振替授業日)、全学の休講日、祝日。日付の順 */
	readonly days: readonly PublicDay[];
	/** 期間に掛かる学期の期間に、規則で推定した値を使った */
	readonly usesEstimatedTerms: boolean;
}

function toPublicLesson(lesson: TimetableLesson, periods: readonly Period[]): PublicLesson {
	const period = findPeriod(lesson.period, periods);
	return { ...lesson, start: period?.start ?? null, end: period?.end ?? null };
}

function toPublicDay(date: CalendarDate, note: DayNote): PublicDay {
	switch (note.kind) {
		case 'substitute':
			return { date, kind: 'substitute', weekday: note.weekday };
		case 'noClass':
			return { date, kind: 'noClass', label: note.label };
		case 'holiday':
			return { date, kind: 'holiday', name: note.name };
	}
}

export function listPeriods(): readonly Period[] {
	return DEFAULT_PERIODS;
}

/** 期間の授業 (時刻つき) と、授業の日に関わる事情 */
export function getPublicTimetable(
	sources: TimetableSources,
	userId: string,
	range: { readonly start: CalendarDate; readonly end: CalendarDate },
): PublicTimetable {
	const timetable = buildUserTimetable(sources, userId, range);
	const periods = listPeriods();
	return {
		lessons: timetable.lessons.map((lesson) => toPublicLesson(lesson, periods)),
		days: [...timetable.notes]
			.map(([date, note]) => toPublicDay(date, note))
			.sort((a, b) => a.date.localeCompare(b.date)),
		usesEstimatedTerms: timetable.usesEstimatedTerms,
	};
}

export interface WeekGrid {
	readonly weekStart: CalendarDate;
	/** 時限ごとの時刻 */
	readonly periods: readonly Period[];
	/** 月曜から日曜の 7 日。cells は、時限の順 (授業のない時限も入り、lessons が空になる) */
	readonly days: readonly {
		readonly date: CalendarDate;
		/** 1 (月) から 7 (日) */
		readonly weekday: number;
		/** 振替授業日、全学の休講日、祝日 */
		readonly note: PublicDay | null;
		readonly cells: readonly {
			readonly period: number;
			readonly lessons: readonly PublicLesson[];
		}[];
	}[];
	readonly usesEstimatedTerms: boolean;
}

/** date を含む週 (月曜から日曜) の、曜日と時限の格子。画面の週の時間割と同じ並びで、整形が要らない */
export function getWeekGrid(
	sources: TimetableSources,
	userId: string,
	date: CalendarDate,
): WeekGrid {
	// 月曜から日曜 (ISO の週)。画面の週の時間割は日曜始まりだが、機械向けには、ふつうの週にする
	const weekStart = addDays(date, -(isoWeekday(date) - 1));
	const timetable = getPublicTimetable(sources, userId, {
		start: weekStart,
		end: addDays(weekStart, 6),
	});
	const periods = listPeriods();
	return {
		weekStart,
		periods,
		days: Array.from({ length: 7 }, (_, index) => {
			const day = addDays(weekStart, index);
			return {
				date: day,
				weekday: index + 1,
				note: timetable.days.find((entry) => entry.date === day) ?? null,
				cells: periods.map(({ number }) => ({
					period: number,
					lessons: timetable.lessons.filter(
						(lesson) => lesson.date === day && lesson.period === number,
					),
				})),
			};
		}),
		usesEstimatedTerms: timetable.usesEstimatedTerms,
	};
}

export interface PublicNextLesson {
	/** 授業中ならその授業。休講の授業は飛ばす。14 日先まで見て、なければ null */
	readonly next: (PublicLesson & { readonly inProgress: boolean }) | null;
}

export function getNextLesson(
	sources: TimetableSources,
	userId: string,
	now: Date,
): PublicNextLesson {
	const current = jstDateTime(now);
	const timetable = buildUserTimetable(sources, userId, {
		start: current.date,
		end: addDays(current.date, NEXT_LESSON_LOOKAHEAD_DAYS - 1),
	});
	const periods = listPeriods();
	const found = findNextLesson(timetable.lessons, current, periods);
	return {
		next: found && { ...toPublicLesson(found.lesson, periods), inProgress: found.inProgress },
	};
}

export interface PublicCourse {
	readonly subjectId: number;
	readonly academicYear: number;
	readonly syllabusId: string;
	readonly name: string;
	readonly teacher: string | null;
	readonly credits: number | null;
	readonly term: string;
	/** 共有の曜日と時限。weekday は 1 (月) から 7 (日) */
	readonly slots: readonly { weekday: number; period: number; room: string | null }[];
}

export interface CourseSources {
	readonly courses: Pick<TimetableSources['courses'], 'listRegistrations' | 'slotsOf'>;
	readonly personalSlots: TimetableSources['personalSlots'];
	readonly subjects: Pick<SubjectStore, 'findById'>;
}

/** 利用者が履修登録した科目と、その曜日と時限 (利用者だけの書き換えがあれば、それを優先する) */
export function listUserCourses(sources: CourseSources, userId: string): PublicCourse[] {
	return sources.courses.listRegistrations(userId).flatMap(({ subjectId }) => {
		const subject = sources.subjects.findById(subjectId);
		if (!subject) return [];
		const personal = sources.personalSlots.listForSubject(userId, subjectId);
		const slots = personal.length > 0 ? personal : sources.courses.slotsOf(subjectId);
		return [
			{
				subjectId,
				academicYear: subject.academicYear,
				syllabusId: subject.syllabusId,
				name: subject.name,
				teacher: subject.teacher,
				credits: subject.credits,
				term: subject.term,
				slots: slots.map(({ weekday, period, room }) => ({ weekday, period, room })),
			},
		];
	});
}

export interface PublicAcademicCalendar {
	readonly academicYear: number;
	readonly terms: readonly {
		term: string;
		start: CalendarDate;
		end: CalendarDate;
		/** manual (管理者が入れた)、auto (学年暦から取った)、estimated (規則で推定した) */
		source: string;
	}[];
	readonly days: readonly PublicDay[];
}

export interface AcademicCalendarSources {
	readonly academicCalendar: Pick<
		AcademicCalendarStore,
		'listTerms' | 'listSubstituteDays' | 'listNoClassDays'
	>;
	readonly holidays: Pick<HolidayStore, 'list'>;
	readonly estimateHolidays: TimetableSources['estimateHolidays'];
}

/** 年度の学期の期間と、その年度の振替授業日、全学の休講日、祝日 */
export function getAcademicCalendar(
	sources: AcademicCalendarSources,
	academicYear: number,
): PublicAcademicCalendar {
	const range = { start: `${academicYear}-04-01`, end: `${academicYear + 1}-03-31` };
	const days: PublicDay[] = [
		...resolveHolidays({
			stored: sources.holidays.list(),
			estimate: sources.estimateHolidays,
			throughYear: academicYear + 1,
		})
			.filter((holiday) => range.start <= holiday.date && holiday.date <= range.end)
			.map((holiday): PublicDay => ({ date: holiday.date, kind: 'holiday', name: holiday.name })),
		...sources.academicCalendar
			.listNoClassDays(range.start, range.end)
			.map((day): PublicDay => ({ date: day.date, kind: 'noClass', label: day.label })),
		...sources.academicCalendar
			.listSubstituteDays(range.start, range.end)
			.map((day): PublicDay => ({ date: day.date, kind: 'substitute', weekday: day.weekday })),
	];
	return {
		academicYear,
		terms: resolveAcademicTerms(academicYear, sources.academicCalendar.listTerms(academicYear)).map(
			({ term, start, end, source }) => ({ term, start, end, source }),
		),
		days: days.sort((a, b) => a.date.localeCompare(b.date)),
	};
}

/** 今日が属する年度 */
export const currentAcademicYear = (now: Date): number => academicYearOf(jstDateTime(now).date);
