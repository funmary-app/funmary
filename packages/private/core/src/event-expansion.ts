// 利用者の予定の展開 (Issue #144)。繰り返しの展開は ical.js に任せ、自前の繰り返しの処理は書かない。
// ical.js は大きいので、@funmary/core の入口 (index.ts) からは出さない。サーバーだけが `@funmary/core/event-expansion` として読む (画面側の JavaScript に入らないようにするため)。
import ICAL from 'ical.js';
import { addDays, eachDate, type CalendarDate } from './calendar-date.ts';
import { DEFAULT_PERIODS, findPeriod, type Period } from './periods.ts';
import type { EventOccurrence, EventTime, UserEvent } from './user-events.ts';

/** 終わりのない繰り返しを、展開しきれない (壊れた指定) ときの、1 つの予定あたりの回数の上限 */
const MAX_ITERATIONS = 20_000;

function daysBetween(start: CalendarDate, end: CalendarDate): number {
	return Math.max([...eachDate(start, end)].length - 1, 0);
}

/** 予定の各回の始まりの日を、日付順に返す。壊れた繰り返しの指定は、単発として扱う */
function* occurrenceStarts(event: UserEvent): Generator<CalendarDate> {
	if (!event.rrule) {
		yield event.startDate;
		return;
	}
	let iterator: ReturnType<ICAL.Recur['iterator']>;
	try {
		iterator = ICAL.Recur.fromString(event.rrule).iterator(
			ICAL.Time.fromDateString(event.startDate),
		);
	} catch {
		yield event.startDate;
		return;
	}
	for (let count = 0; count < MAX_ITERATIONS; count++) {
		const next = iterator.next();
		if (!next) return;
		yield next.toString().slice(0, 10);
	}
}

function resolveTime(
	time: EventTime,
	periods: readonly Period[],
): Pick<EventOccurrence, 'allDay' | 'start' | 'end' | 'periods'> {
	const allDay = { allDay: true, start: null, end: null, periods: null } as const;
	if (time.kind === 'allDay') return allDay;
	if (time.kind === 'time')
		return { allDay: false, start: time.start, end: time.end, periods: null };
	const first = findPeriod(time.from, periods);
	const last = findPeriod(time.to, periods);
	if (!first || !last) return allDay;
	return {
		allDay: false,
		start: first.start,
		end: last.end,
		periods: { from: time.from, to: time.to },
	};
}

/**
 * from から to まで (両端を含む) に重なる、予定の各回を返す。終日、時刻の順に並べる。
 * 数日にわたる予定は、始まりの日で 1 件にして、その回の終わりの日を持たせる
 */
export function expandUserEvents(
	events: readonly UserEvent[],
	from: CalendarDate,
	to: CalendarDate,
	periods: readonly Period[] = DEFAULT_PERIODS,
): EventOccurrence[] {
	const result: EventOccurrence[] = [];
	for (const event of events) {
		const span = daysBetween(event.startDate, event.endDate);
		const excluded = new Set(event.excludedDates);
		for (const start of occurrenceStarts(event)) {
			if (start > to) break;
			const end = addDays(start, span);
			if (end < from || excluded.has(start)) continue;
			result.push({
				key: `${event.id}:${start}`,
				eventId: event.id,
				title: event.title,
				location: event.location,
				notes: event.notes,
				startDate: start,
				endDate: end,
				...resolveTime(event.time, periods),
			});
		}
	}
	return result.sort(
		(a, b) =>
			a.startDate.localeCompare(b.startDate) ||
			(a.start ?? '').localeCompare(b.start ?? '') ||
			a.eventId - b.eventId,
	);
}
