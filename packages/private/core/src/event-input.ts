// 予定の入力の検査。画面のフォームと、公開 API (JSON) の両方が、この 1 つの検査を通る。
// 入力は、欄の名前で値を引ける形 (FormData と同じ get と getAll) にそろえてから渡す。ical.js は読み込まない。
import { isoWeekday, type Weekday } from './calendar-date.ts';
import { recurrenceToRrule } from './user-events.ts';
import type { EventTime, Recurrence, RecurrenceEnd, UserEvent } from './user-events.ts';

/** 欄の名前で値を引ける入力。FormData はそのまま渡せる */
export interface EventFieldReader {
	get(name: string): unknown;
	getAll(name: string): unknown[];
}

/** 公開範囲。private は本人だけ、link は共有のリンクを知っている人、public はログインしている全員 */
export type Visibility = 'private' | 'link' | 'public';
export const VISIBILITIES: readonly Visibility[] = ['private', 'link', 'public'];

/** 公開範囲。知らない値や、空は、非公開にする (誤って公開しないため) */
export function parseVisibility(value: string): Visibility {
	return (VISIBILITIES as readonly string[]).includes(value) ? (value as Visibility) : 'private';
}

export type EventInput = Omit<UserEvent, 'id'> & { readonly visibility: Visibility };

export type EventFormResult =
	| { readonly ok: true; readonly value: EventInput }
	| { readonly ok: false; readonly error: string };

const TITLE_MAX = 100;
const LOCATION_MAX = 100;
const NOTES_MAX = 1000;
/** 数日にわたる予定の、最長の日数 */
const SPAN_MAX_DAYS = 60;
const PERIODS = [1, 2, 3, 4, 5, 6];

const isDate = (value: string) => {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const isTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const text = (form: EventFieldReader, name: string) => {
	const value = form.get(name);
	return typeof value === 'string' ? value.trim() : '';
};
const daysBetween = (start: string, end: string) =>
	Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
const integer = (value: string, min: number, max: number) => {
	if (!/^\d+$/.test(value)) return null;
	const number = Number(value);
	return number >= min && number <= max ? number : null;
};
const fail = (error: string): EventFormResult => ({ ok: false, error });

function parseTime(form: EventFieldReader, spans: boolean): EventTime | string {
	const kind = text(form, 'timeKind');
	if (spans && kind !== 'allDay') return '数日にわたる予定は、終日だけ選べます。';
	if (kind === 'allDay') return { kind: 'allDay' };
	if (kind === 'time') {
		const start = text(form, 'startTime');
		const end = text(form, 'endTime');
		if (!isTime(start) || !isTime(end)) return '時刻は 24 時間表記の「時:分」で入力してください。';
		if (end <= start) return '終了時刻は開始時刻より後にしてください。';
		return { kind: 'time', start, end };
	}
	if (kind === 'period') {
		const from = integer(text(form, 'startPeriod'), 1, PERIODS.length);
		const to = integer(text(form, 'endPeriod'), 1, PERIODS.length);
		if (from === null || to === null) return '時限は、1 限から 6 限までで選んでください。';
		if (to < from) return '終わりの時限は、始まりと同じか、それより後にしてください。';
		return { kind: 'period', from, to };
	}
	return '時間の選び方が正しくありません。';
}

function parseRecurrence(
	form: EventFieldReader,
	startDate: string,
): { rrule: string | null } | { error: string } {
	const repeat = text(form, 'repeat');
	if (repeat === '' || repeat === 'none') return { rrule: null };
	if (!['daily', 'weekly', 'monthly', 'yearly'].includes(repeat)) {
		return { error: '繰り返しの選び方が正しくありません。' };
	}
	const interval = integer(text(form, 'interval') || '1', 1, 99);
	if (interval === null) return { error: '繰り返しの間隔は、1 から 99 までで入れてください。' };

	let end: RecurrenceEnd = { kind: 'never' };
	const endKind = text(form, 'endKind');
	if (endKind === 'count') {
		const count = integer(text(form, 'count'), 1, 999);
		if (count === null) return { error: '繰り返す回数は、1 から 999 までで入れてください。' };
		end = { kind: 'count', count };
	} else if (endKind === 'until') {
		const date = text(form, 'untilDate');
		if (!isDate(date)) return { error: '繰り返しの終わりの日を、日付で入れてください。' };
		if (date < startDate) return { error: '繰り返しの終わりの日は、開始日以降にしてください。' };
		end = { kind: 'until', date };
	}

	let recurrence: Recurrence;
	if (repeat === 'weekly') {
		const weekdays = form
			.getAll('weekday')
			.map((value) => (typeof value === 'string' ? integer(value, 1, 7) : null))
			.filter((value): value is number => value !== null) as Weekday[];
		recurrence = { freq: 'weekly', interval, weekdays, end };
	} else if (repeat === 'monthly') {
		const mode = text(form, 'monthlyMode');
		const weekday = isoWeekday(startDate);
		const nth = Math.ceil(Number(startDate.slice(8, 10)) / 7) as 1 | 2 | 3 | 4 | 5;
		recurrence = {
			freq: 'monthly',
			interval,
			monthly:
				mode === 'nth'
					? { by: 'nth', nth, weekday }
					: mode === 'last'
						? { by: 'nth', nth: -1, weekday }
						: { by: 'day' },
			end,
		};
	} else {
		recurrence = { freq: repeat as 'daily' | 'yearly', interval, end };
	}
	return { rrule: recurrenceToRrule(recurrence, startDate) };
}

/** フォームの入力を予定に変換する。入力を修正する必要があればエラーメッセージを返す。 */
export function parseEventFields(form: EventFieldReader): EventFormResult {
	const title = text(form, 'title');
	if (title === '') return fail('予定の名前を入れてください。');
	if (title.length > TITLE_MAX) return fail(`予定の名前は ${TITLE_MAX} 文字までにしてください。`);
	const location = text(form, 'location');
	if (location.length > LOCATION_MAX)
		return fail(`場所は ${LOCATION_MAX} 文字までにしてください。`);
	const notes = text(form, 'notes');
	if (notes.length > NOTES_MAX) return fail(`メモは ${NOTES_MAX} 文字までにしてください。`);

	const startDate = text(form, 'startDate');
	if (!isDate(startDate)) return fail('開始日に正しい日付を入力してください。');
	const endInput = text(form, 'endDate');
	const endDate = endInput === '' ? startDate : endInput;
	if (!isDate(endDate)) return fail('終了日に正しい日付を入力してください。');
	if (endDate < startDate) return fail('終了日は、開始日以降にしてください。');
	if (daysBetween(startDate, endDate) >= SPAN_MAX_DAYS) {
		return fail(`予定の期間は開始日と終了日を含めて ${SPAN_MAX_DAYS} 日以内にしてください。`);
	}

	const time = parseTime(form, endDate > startDate);
	if (typeof time === 'string') return fail(time);
	const recurrence = parseRecurrence(form, startDate);
	if ('error' in recurrence) return fail(recurrence.error);

	// 除く日は、繰り返す予定だけに付ける。正しい日付だけを、重複なく残す
	const excludedDates =
		recurrence.rrule === null
			? []
			: [
					...new Set(
						form
							.getAll('exclude')
							.filter((value): value is string => typeof value === 'string' && isDate(value)),
					),
				].sort();

	return {
		ok: true,
		value: {
			title,
			location: location === '' ? null : location,
			notes: notes === '' ? null : notes,
			startDate,
			endDate,
			time,
			rrule: recurrence.rrule,
			excludedDates,
			visibility: parseVisibility(text(form, 'visibility')),
		},
	};
}
