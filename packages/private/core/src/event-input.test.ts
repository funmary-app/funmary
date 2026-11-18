import { describe, expect, it } from 'vitest';
import { parseEventFields, type EventFieldReader } from './event-input.ts';

/** FormData でなく、欄の名前と値の表から作る入力 (公開 API が使う形) */
const reader = (fields: Record<string, string | string[]>): EventFieldReader => ({
	get: (name) => {
		const value = fields[name];
		return Array.isArray(value) ? value[0] : value;
	},
	getAll: (name) => {
		const value = fields[name];
		return value === undefined ? [] : Array.isArray(value) ? value : [value];
	},
});

describe('予定の入力の検査', () => {
	it('FormData でなくても、欄の名前で値を引ける入力なら、予定にできる', () => {
		const result = parseEventFields(
			reader({
				title: '歯医者',
				startDate: '2026-10-20',
				timeKind: 'time',
				startTime: '10:00',
				endTime: '11:00',
			}),
		);

		expect(result).toEqual({
			ok: true,
			value: {
				title: '歯医者',
				location: null,
				notes: null,
				startDate: '2026-10-20',
				endDate: '2026-10-20',
				time: { kind: 'time', start: '10:00', end: '11:00' },
				rrule: null,
				excludedDates: [],
				visibility: 'private',
			},
		});
	});

	it('公開範囲に未定義の値を指定すると、非公開になる', () => {
		const result = parseEventFields(
			reader({ title: 'a', startDate: '2026-10-20', timeKind: 'allDay', visibility: 'everyone' }),
		);

		expect(result).toMatchObject({ ok: true, value: { visibility: 'private' } });
	});

	it.each(['2025-02-29', '2026-13-01'])('暦にない開始日 (%s) は登録できない', (startDate) => {
		const result = parseEventFields(reader({ title: '打ち合わせ', startDate, timeKind: 'allDay' }));

		expect(result).toEqual({ ok: false, error: '開始日に正しい日付を入力してください。' });
	});

	it.each(['24:00', '時刻09:30', '09:30頃'])(
		'時刻の形式が正しくない場合 (%s) は登録できない',
		(startTime) => {
			const result = parseEventFields(
				reader({
					title: '打ち合わせ',
					startDate: '2026-10-20',
					timeKind: 'time',
					startTime,
					endTime: '19:59',
				}),
			);

			expect(result).toEqual({
				ok: false,
				error: '時刻は 24 時間表記の「時:分」で入力してください。',
			});
		},
	);

	it('開始時刻と終了時刻が同じ予定は登録できない', () => {
		expect(
			parseEventFields(
				reader({
					title: '打ち合わせ',
					startDate: '2026-10-20',
					timeKind: 'time',
					startTime: '10:00',
					endTime: '10:00',
				}),
			),
		).toEqual({ ok: false, error: '終了時刻は開始時刻より後にしてください。' });
	});

	it('終日の予定は開始日と終了日を含めて 60 日まで登録できる', () => {
		const fields = {
			title: '展示',
			startDate: '2026-10-01',
			timeKind: 'allDay',
		};
		expect(parseEventFields(reader({ ...fields, endDate: '2026-11-29' }))).toMatchObject({
			ok: true,
			value: { startDate: '2026-10-01', endDate: '2026-11-29' },
		});
		expect(parseEventFields(reader({ ...fields, endDate: '2026-11-30' }))).toEqual({
			ok: false,
			error: '予定の期間は開始日と終了日を含めて 60 日以内にしてください。',
		});
	});

	it('予定名を空欄にすると、入力を促す', () => {
		expect(
			parseEventFields(reader({ title: '', startDate: '2026-10-20', timeKind: 'allDay' })),
		).toEqual({
			ok: false,
			error: '予定の名前を入れてください。',
		});
	});
});
