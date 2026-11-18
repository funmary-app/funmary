// 公開 API と MCP が受け取る、予定の JSON。画面のフォームと同じ検査 (@funmary/core の parseEventFields) を通すため、JSON を、フォームの欄の名前と値の表にそろえてから渡す。公開範囲は受け取らない (誤って公開しないため)。
import {
	rruleToRecurrence,
	type EventFieldReader,
	type EventInput,
	type Recurrence,
} from '@funmary/core';
import * as v from 'valibot';

const DateString = v.pipe(v.string(), v.isoDate(), v.description('YYYY-MM-DD'));

const TimeSchema = v.variant('kind', [
	v.strictObject({ kind: v.literal('allDay') }),
	v.strictObject({
		kind: v.literal('time'),
		start: v.pipe(v.string(), v.description('HH:MM (日本時間)')),
		end: v.pipe(v.string(), v.description('HH:MM。始まりより後')),
	}),
	v.strictObject({
		kind: v.literal('period'),
		from: v.pipe(v.number(), v.description('始まりの時限 (1 から 6)')),
		to: v.pipe(v.number(), v.description('終わりの時限 (始まり以上、6 まで)')),
	}),
]);

const RepeatEndSchema = v.variant('kind', [
	v.strictObject({ kind: v.literal('never') }),
	v.strictObject({ kind: v.literal('until'), date: DateString }),
	v.strictObject({ kind: v.literal('count'), count: v.number() }),
]);

const RepeatSchema = v.strictObject({
	freq: v.picklist(['daily', 'weekly', 'monthly', 'yearly']),
	interval: v.pipe(v.optional(v.number()), v.description('間隔 (1 から 99)。省けば 1')),
	weekdays: v.pipe(
		v.optional(v.array(v.number())),
		v.description('weekly のとき。曜日 (月曜が 1、日曜が 7)。省けば開始日の曜日'),
	),
	monthly: v.pipe(
		v.optional(v.picklist(['day', 'nth', 'last'])),
		v.description('monthly のとき。day は毎月の同じ日、nth は第何曜日、last は最終週の曜日'),
	),
	end: v.pipe(v.optional(RepeatEndSchema), v.description('省けば、終わりなし')),
});

/** 予定を足す、直すときに送る本文。直すときは、全体を送り直す (送らなかった項目は、空になる) */
export const EventBodySchema = v.strictObject({
	title: v.string(),
	location: v.optional(v.nullable(v.string())),
	notes: v.optional(v.nullable(v.string())),
	startDate: DateString,
	endDate: v.pipe(v.optional(v.nullable(DateString)), v.description('省けば開始日と同じ')),
	time: TimeSchema,
	repeat: v.pipe(
		v.optional(v.nullable(RepeatSchema)),
		v.description('繰り返さないなら省くか null'),
	),
	excludedDates: v.pipe(
		v.optional(v.array(DateString)),
		v.description('繰り返しから除く日 (始まりの日で数える)'),
	),
});
export type EventBody = v.InferOutput<typeof EventBodySchema>;

/** 予定を、本文と同じ形で返す。そのまま (id を除いて) 送り直せる */
export const EventResultSchema = v.object({ id: v.number(), ...EventBodySchema.entries });
export type EventResult = v.InferOutput<typeof EventResultSchema>;

/** JSON の本文を、フォームの欄の名前と値の表にそろえる */
export function eventBodyToFields(body: EventBody): EventFieldReader {
	const fields = new Map<string, string[]>();
	const set = (name: string, ...values: (string | number | null | undefined)[]) =>
		fields.set(name, values.filter((value) => value !== null && value !== undefined).map(String));
	set('title', body.title);
	set('location', body.location);
	set('notes', body.notes);
	set('startDate', body.startDate);
	set('endDate', body.endDate);
	set('timeKind', body.time.kind);
	if (body.time.kind === 'time') {
		set('startTime', body.time.start);
		set('endTime', body.time.end);
	}
	if (body.time.kind === 'period') {
		set('startPeriod', body.time.from);
		set('endPeriod', body.time.to);
	}
	const repeat = body.repeat;
	set('repeat', repeat ? repeat.freq : 'none');
	if (repeat) {
		set('interval', repeat.interval);
		fields.set('weekday', (repeat.weekdays ?? []).map(String));
		set('monthlyMode', repeat.monthly);
		set('endKind', repeat.end?.kind ?? 'never');
		if (repeat.end?.kind === 'until') set('untilDate', repeat.end.date);
		if (repeat.end?.kind === 'count') set('count', repeat.end.count);
	}
	fields.set('exclude', (body.excludedDates ?? []).map(String));
	return {
		get: (name) => fields.get(name)?.[0],
		getAll: (name) => fields.get(name) ?? [],
	};
}

const repeatOf = (recurrence: Recurrence): NonNullable<EventBody['repeat']> => {
	const end = { ...recurrence.end };
	const base = { freq: recurrence.freq, interval: recurrence.interval, end };
	if (recurrence.freq === 'weekly') return { ...base, weekdays: [...recurrence.weekdays] };
	if (recurrence.freq === 'monthly') {
		const { monthly } = recurrence;
		return {
			...base,
			monthly: monthly.by === 'day' ? 'day' : monthly.nth === -1 ? 'last' : 'nth',
		};
	}
	return base;
};

/** 保存した予定を、本文と同じ形にする。このアプリが作らない繰り返しは、繰り返しなしとして返す */
export function eventToBody(event: EventInput & { readonly id: number }): EventResult {
	const recurrence = event.rrule ? rruleToRecurrence(event.rrule) : null;
	return {
		id: event.id,
		title: event.title,
		location: event.location,
		notes: event.notes,
		startDate: event.startDate,
		endDate: event.endDate,
		time: { ...event.time },
		repeat: recurrence ? repeatOf(recurrence) : null,
		excludedDates: recurrence ? [...event.excludedDates] : [],
	};
}
