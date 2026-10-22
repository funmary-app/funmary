// 予定の追加と編集のフォーム (Issue #144)。ブラウザから来る値は信用せず、ここで検査して、UserEvent の形にする。
// 繰り返しの選び方は、Google カレンダーと同じ項目にして、RRULE に直す。編集では、保存した予定を、同じ項目に戻す。
// 検査は、公開 API と同じもの (@funmary/core の parseEventFields) を通る。ical.js は読み込まない (画面側からも読まれるので、大きな依存を持ち込まないため)。
import {
	parseEventFields,
	parseVisibility,
	rruleToRecurrence,
	type EventFormResult,
	type UserEvent,
	type Visibility,
} from '@funmary/core';

export { type Visibility };

/** フォームの欄の値。すべて文字列 (入力欄の値のまま) */
export interface EventFormValues {
	title: string;
	location: string;
	notes: string;
	startDate: string;
	endDate: string;
	timeKind: 'allDay' | 'time' | 'period';
	startTime: string;
	endTime: string;
	startPeriod: string;
	endPeriod: string;
	repeat: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
	interval: string;
	weekdays: string[];
	monthlyMode: 'day' | 'nth' | 'last';
	endKind: 'never' | 'until' | 'count';
	untilDate: string;
	count: string;
	excludedDates: string[];
	visibility: Visibility;
}

/** 今日の日付を、初期値の開始日にするための空のフォーム */
export function emptyFormValues(startDate: string): EventFormValues {
	return {
		title: '',
		location: '',
		notes: '',
		startDate,
		endDate: '',
		timeKind: 'time',
		startTime: '18:00',
		endTime: '19:00',
		startPeriod: '1',
		endPeriod: '1',
		repeat: 'none',
		interval: '1',
		weekdays: [],
		monthlyMode: 'day',
		endKind: 'never',
		untilDate: '',
		count: '10',
		excludedDates: [],
		visibility: 'private',
	};
}

const text = (form: FormData, name: string) => {
	const value = form.get(name);
	return typeof value === 'string' ? value.trim() : '';
};

/** フォームの値を検査して、予定にする。検査は、公開 API と同じもの (core) を通る */
export function parseEventForm(form: FormData): EventFormResult {
	return parseEventFields(form);
}

/** 保存した予定を、編集のフォームの値に戻す。このアプリが作らない繰り返しは、繰り返しなしとして戻す */
export function toFormValues(event: UserEvent & { visibility?: Visibility }): EventFormValues {
	const values: EventFormValues = {
		...emptyFormValues(event.startDate),
		title: event.title,
		location: event.location ?? '',
		notes: event.notes ?? '',
		endDate: event.endDate === event.startDate ? '' : event.endDate,
		timeKind: event.time.kind,
		excludedDates: [...event.excludedDates],
		visibility: event.visibility ?? 'private',
	};
	if (event.time.kind === 'time') {
		values.startTime = event.time.start;
		values.endTime = event.time.end;
	} else if (event.time.kind === 'period') {
		values.startPeriod = String(event.time.from);
		values.endPeriod = String(event.time.to);
	}
	const recurrence = event.rrule ? rruleToRecurrence(event.rrule) : null;
	if (!recurrence) return { ...values, excludedDates: [] };
	values.repeat = recurrence.freq;
	values.interval = String(recurrence.interval);
	if (recurrence.freq === 'weekly') values.weekdays = recurrence.weekdays.map(String);
	if (recurrence.freq === 'monthly') {
		values.monthlyMode =
			recurrence.monthly.by === 'day' ? 'day' : recurrence.monthly.nth === -1 ? 'last' : 'nth';
	}
	values.endKind = recurrence.end.kind;
	if (recurrence.end.kind === 'until') values.untilDate = recurrence.end.date;
	if (recurrence.end.kind === 'count') values.count = String(recurrence.end.count);
	return values;
}

/** 誤りで送り返すときに、入力した値を、そのまま画面に戻す (読めない欄は空にする) */
export function echoFormValues(form: FormData, fallbackStartDate: string): EventFormValues {
	const base = emptyFormValues(fallbackStartDate);
	const pick = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => {
		const value = text(form, name);
		return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
	};
	return {
		title: text(form, 'title'),
		location: text(form, 'location'),
		notes: text(form, 'notes'),
		startDate: text(form, 'startDate') || fallbackStartDate,
		endDate: text(form, 'endDate'),
		timeKind: pick('timeKind', ['allDay', 'time', 'period'], base.timeKind),
		startTime: text(form, 'startTime') || base.startTime,
		endTime: text(form, 'endTime') || base.endTime,
		startPeriod: text(form, 'startPeriod') || base.startPeriod,
		endPeriod: text(form, 'endPeriod') || base.endPeriod,
		repeat: pick('repeat', ['none', 'daily', 'weekly', 'monthly', 'yearly'], base.repeat),
		interval: text(form, 'interval') || base.interval,
		weekdays: form.getAll('weekday').filter((value): value is string => typeof value === 'string'),
		monthlyMode: pick('monthlyMode', ['day', 'nth', 'last'], base.monthlyMode),
		endKind: pick('endKind', ['never', 'until', 'count'], base.endKind),
		untilDate: text(form, 'untilDate'),
		count: text(form, 'count') || base.count,
		excludedDates: form
			.getAll('exclude')
			.filter((value): value is string => typeof value === 'string'),
		visibility: parseVisibility(text(form, 'visibility')),
	};
}
