import { describe, expect, it } from 'vitest';
import { parseSlotFields, parseSlotForm, parseSubjectId } from './course-form.ts';

function form(values: Record<string, string>): FormData {
	const data = new FormData();
	for (const [key, value] of Object.entries(values)) data.set(key, value);
	return data;
}

describe('parseSubjectId', () => {
	it('正の整数だけを科目の ID として受け取る', () => {
		expect(parseSubjectId(form({ subjectId: '12' }))).toBe(12);
		for (const bad of ['', '0', '-1', '1.5', '1e3', 'abc', ' 12']) {
			expect(parseSubjectId(form({ subjectId: bad }))).toBeNull();
		}
		expect(parseSubjectId(new FormData())).toBeNull();
	});
});

describe('parseSlotForm', () => {
	const valid = { subjectId: '3', weekday: '2', period: '4', room: ' 363 ' };

	it('曜日、時限、教室を読み、教室の前後の空白を除く', () => {
		expect(parseSlotForm(form(valid))).toEqual({
			ok: true,
			value: { subjectId: 3, weekday: 2, period: 4, room: '363' },
		});
	});

	it('科目が選ばれていなければ、そのことを伝える', () => {
		expect(parseSlotForm(form({ ...valid, subjectId: '' }))).toEqual({
			ok: false,
			error: '科目が選ばれていません',
		});
	});

	// 曜日、時限、教室の規則そのものは、@funmary/core の parseSlotInput のテストで確かめる
	it('曜日と時限の値の誤りは、それぞれの欄の誤りとして伝える', () => {
		expect(parseSlotForm(form({ ...valid, weekday: '0' }))).toEqual({
			ok: false,
			error: '曜日は月曜から土曜の中から選んでください',
		});
		expect(parseSlotForm(form({ ...valid, period: '7' }))).toEqual({
			ok: false,
			error: '時限を選んでください',
		});
	});
});

describe('parseSlotFields', () => {
	it('科目の ID を含めず、曜日、時限、教室だけを読む', () => {
		expect(parseSlotFields(form({ weekday: '2', period: '4', room: ' 363 ' }))).toEqual({
			ok: true,
			value: { weekday: 2, period: 4, room: '363' },
		});
	});
});
