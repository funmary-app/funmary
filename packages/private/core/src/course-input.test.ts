import { describe, expect, it } from 'vitest';
import { parseAbbreviation, parseSlotInput } from './course-input.ts';

describe('parseSlotInput', () => {
	it('曜日、時限、教室を読み、教室の前後の空白を除く', () => {
		expect(parseSlotInput({ weekday: 2, period: 4, room: ' 363 ' })).toEqual({
			ok: true,
			value: { weekday: 2, period: 4, room: '363' },
		});
	});

	it('フォームの値のように、数字の文字列でも読む', () => {
		expect(parseSlotInput({ weekday: '2', period: '4' })).toEqual({
			ok: true,
			value: { weekday: 2, period: 4, room: null },
		});
	});

	it('土曜の 6 限まで登録できる', () => {
		expect(parseSlotInput({ weekday: 6, period: 6 })).toEqual({
			ok: true,
			value: { weekday: 6, period: 6, room: null },
		});
	});

	it('教室が空、空白だけ、未指定、null なら null にする', () => {
		for (const room of ['', '  ', undefined, null]) {
			expect(parseSlotInput({ weekday: 1, period: 1, room })).toMatchObject({
				ok: true,
				value: { room: null },
			});
		}
	});

	it('月曜から土曜、1 限から 6 限の外は受け付けない', () => {
		for (const weekday of [0, 7, 1.5, 'x', null, undefined, '１']) {
			expect(parseSlotInput({ weekday, period: 1 }).ok, String(weekday)).toBe(false);
		}
		for (const period of [0, 7, 1.5, 'x', null, undefined]) {
			expect(parseSlotInput({ weekday: 1, period }).ok, String(period)).toBe(false);
		}
	});

	it('教室名は 100 文字までで、制御文字を含められない', () => {
		expect(parseSlotInput({ weekday: 1, period: 1, room: 'a'.repeat(100) }).ok).toBe(true);
		expect(parseSlotInput({ weekday: 1, period: 1, room: 'a'.repeat(101) })).toEqual({
			ok: false,
			error: '教室名は 100 文字以内で入力してください',
		});
		expect(parseSlotInput({ weekday: 1, period: 1, room: '3\n63' })).toEqual({
			ok: false,
			error: '教室名に改行などの制御文字は使えません',
		});
		expect(parseSlotInput({ weekday: 1, period: 1, room: 363 })).toEqual({
			ok: false,
			error: '教室名は文字列で指定してください',
		});
	});

	it('誤りには、直し方が分かる文が入る', () => {
		expect(parseSlotInput({ weekday: 9, period: 1 })).toEqual({
			ok: false,
			error: '曜日は月曜から土曜の中から選んでください',
		});
		expect(parseSlotInput({ weekday: 1, period: 9 })).toEqual({
			ok: false,
			error: '時限を選んでください',
		});
	});
});

describe('parseAbbreviation', () => {
	it('前後の空白を除いて返す。空でもよい (正式名称に戻す指定)', () => {
		expect(parseAbbreviation(' 線形 ')).toEqual({ ok: true, value: '線形' });
		expect(parseAbbreviation('')).toEqual({ ok: true, value: '' });
	});

	it('文字列以外は受け付けず、正式名称に戻す方法を案内する', () => {
		expect(parseAbbreviation(null)).toEqual({
			ok: false,
			error: '略称の入力を確認してください。空欄で保存すると正式名称に戻ります。',
		});
		expect(parseAbbreviation(3).ok).toBe(false);
	});

	it('100 文字までにする', () => {
		expect(parseAbbreviation('あ'.repeat(100)).ok).toBe(true);
		expect(parseAbbreviation('あ'.repeat(101))).toEqual({
			ok: false,
			error: '略称は 100 文字以内で入力してください。',
		});
	});
});
