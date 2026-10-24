import { describe, expect, it } from 'vitest';
import { resolveAcademicTerms } from '@funmary/core';
import { termRegistrationReminder } from './term-reminder.ts';

const terms = [
	...resolveAcademicTerms(2026, [
		{ term: 'fall', start: '2026-09-24', end: '2027-01-31', source: 'auto' },
	]),
	...resolveAcademicTerms(2027, []),
];
const fall = (term: string) => ({ academicYear: 2026, term });

describe('termRegistrationReminder', () => {
	it('後期が近いか始まっていて、後期の科目を 1 つも履修していなければ、案内を返す', () => {
		expect(termRegistrationReminder(terms, '2026-09-15', [fall('spring')])).toEqual({
			label: '2026 年度後期',
			start: '2026-09-24',
			started: false,
		});
		expect(termRegistrationReminder(terms, '2026-10-24', [])).toMatchObject({ started: true });
	});

	it('その学期の科目 (通年とクォーターを含む) を履修していれば、案内しない', () => {
		expect(termRegistrationReminder(terms, '2026-10-24', [fall('q3')])).toBeNull();
		expect(termRegistrationReminder(terms, '2026-10-24', [fall('full-year')])).toBeNull();
	});

	it('3 月には、次の年度の前期を案内する。前の年度の前期の科目は数えない', () => {
		expect(
			termRegistrationReminder(terms, '2027-03-25', [{ academicYear: 2026, term: 'spring' }]),
		).toEqual({ label: '2027 年度前期', start: '2027-04-01', started: false });
	});

	it('どの学期にも近くなければ、案内しない', () => {
		expect(termRegistrationReminder(terms, '2026-09-01', [])).toBeNull();
	});
});
