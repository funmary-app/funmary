import { parseEventFields } from '@funmary/core';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { EventBodySchema, eventBodyToFields, eventToBody } from './event-json.ts';

const parse = (input: unknown) => {
	const body = v.parse(EventBodySchema, input);
	return parseEventFields(eventBodyToFields(body));
};

describe('予定の JSON', () => {
	it('時刻つきの単発の予定を、画面と同じ検査を通して、予定にする', () => {
		expect(
			parse({
				title: '歯医者',
				startDate: '2026-10-20',
				time: { kind: 'time', start: '10:00', end: '11:00' },
			}),
		).toMatchObject({
			ok: true,
			value: {
				title: '歯医者',
				endDate: '2026-10-20',
				time: { kind: 'time', start: '10:00', end: '11:00' },
				rrule: null,
				visibility: 'private',
			},
		});
	});

	it('毎週の繰り返しと、除く日を、RRULE にする', () => {
		const result = parse({
			title: '輪講',
			startDate: '2026-10-21',
			time: { kind: 'period', from: 3, to: 4 },
			repeat: { freq: 'weekly', weekdays: [3], end: { kind: 'count', count: 5 } },
			excludedDates: ['2026-10-28'],
		});

		expect(result).toMatchObject({
			ok: true,
			value: { rrule: 'FREQ=WEEKLY;BYDAY=WE;COUNT=5', excludedDates: ['2026-10-28'] },
		});
	});

	it('画面と同じ決まりで、誤りを返す (時刻の順、名前の長さなど)', () => {
		expect(
			parse({
				title: '逆さの時刻',
				startDate: '2026-10-20',
				time: { kind: 'time', start: '11:00', end: '10:00' },
			}),
		).toEqual({ ok: false, error: '終了時刻は開始時刻より後にしてください。' });
		expect(
			parse({ title: 'あ'.repeat(101), startDate: '2026-10-20', time: { kind: 'allDay' } }),
		).toEqual({ ok: false, error: '予定の名前は 100 文字までにしてください。' });
	});

	it('公開範囲は受け取らない (誤って公開しないため、形の検査で断る)', () => {
		expect(
			v.safeParse(EventBodySchema, {
				title: 'a',
				startDate: '2026-10-20',
				time: { kind: 'allDay' },
				visibility: 'public',
			}).success,
		).toBe(false);
	});

	it('保存した予定を、そのまま送り直せる形に戻す', () => {
		const body = {
			title: '輪講',
			location: '研究室',
			notes: null,
			startDate: '2026-10-21',
			endDate: '2026-10-21',
			time: { kind: 'period' as const, from: 3, to: 4 },
			repeat: {
				freq: 'weekly' as const,
				interval: 1,
				weekdays: [3],
				end: { kind: 'count' as const, count: 5 },
			},
			excludedDates: ['2026-10-28'],
		};
		const parsed = parse(body);
		if (!parsed.ok) throw new Error(parsed.error);

		const returned = eventToBody({ id: 9, ...parsed.value });

		expect(returned).toEqual({ id: 9, ...body });
		const sent: Record<string, unknown> = { ...returned };
		delete sent['id'];
		expect(parse(sent)).toEqual(parsed);
	});

	it('繰り返しのない予定は、repeat が null', () => {
		const parsed = parse({ title: 'a', startDate: '2026-10-20', time: { kind: 'allDay' } });
		if (!parsed.ok) throw new Error(parsed.error);

		expect(eventToBody({ id: 1, ...parsed.value })).toMatchObject({
			repeat: null,
			excludedDates: [],
		});
	});
});
