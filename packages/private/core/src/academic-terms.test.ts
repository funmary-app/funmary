import { describe, expect, it } from 'vitest';
import { addDays, isoWeekday } from './calendar-date.ts';
import {
	estimateAcademicTerms,
	resolveAcademicTerms,
	termsOn,
	type StoredTerm,
} from './academic-terms.ts';

describe('addDays', () => {
	it('月や年をまたいで日付を足し引きする', () => {
		expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
		expect(addDays('2026-04-06', 0)).toBe('2026-04-06');
	});
});

describe('estimateAcademicTerms', () => {
	it('前期は 4/1 から 7/31、後期は 9 月の第 3 月曜日から翌年の 1/31 までにする', () => {
		expect(estimateAcademicTerms(2026)).toEqual([
			{ term: 'spring', start: '2026-04-01', end: '2026-07-31' },
			{ term: 'fall', start: '2026-09-21', end: '2027-01-31' },
		]);
	});

	it('どの年度でも、後期は 9 月の 15 日から 21 日の月曜に始まり、翌年の 1/31 に終わる', () => {
		for (let year = 2020; year <= 2060; year++) {
			const [spring, fall] = estimateAcademicTerms(year);
			expect(spring).toEqual({ term: 'spring', start: `${year}-04-01`, end: `${year}-07-31` });

			expect(isoWeekday(fall!.start)).toBe(1);
			expect(fall!.start.startsWith(`${year}-09-`)).toBe(true);
			expect(Number(fall!.start.slice(8))).toBeGreaterThanOrEqual(15);
			expect(Number(fall!.start.slice(8))).toBeLessThanOrEqual(21);
			expect(fall!.end).toBe(`${year + 1}-01-31`);
			expect(spring!.end < fall!.start).toBe(true);
		}
	});
});

const stored = (
	term: StoredTerm['term'],
	start: string,
	end: string,
	source: StoredTerm['source'],
): StoredTerm => ({ term, start, end, source });

describe('resolveAcademicTerms', () => {
	it('何も保存されていなければ、前期と後期を推定で返し、推定と分かるようにする', () => {
		const result = resolveAcademicTerms(2026, []);
		expect(
			result.filter((t) => t.term === 'spring' || t.term === 'fall').map((t) => [t.term, t.source]),
		).toEqual([
			['spring', 'estimated'],
			['fall', 'estimated'],
		]);
		expect(result.find((t) => t.term === 'spring')).toMatchObject({
			start: '2026-04-01',
			end: '2026-07-31',
		});
	});

	it('保存された値を、推定より先に使う。保存されていない学期だけ推定で補う', () => {
		const result = resolveAcademicTerms(2026, [
			stored('spring', '2026-04-08', '2026-07-22', 'auto'),
		]);
		expect(result.find((t) => t.term === 'spring')).toEqual({
			term: 'spring',
			start: '2026-04-08',
			end: '2026-07-22',
			source: 'auto',
		});
		expect(result.find((t) => t.term === 'fall')?.source).toBe('estimated');
	});

	it('自動と手入力が両方あれば、管理者が入れた手入力を使う (取得した値が誤っているときに直せるように)', () => {
		const result = resolveAcademicTerms(2026, [
			stored('spring', '2026-04-06', '2026-07-24', 'auto'),
			stored('spring', '2026-04-07', '2026-07-23', 'manual'),
		]);
		expect(result.find((t) => t.term === 'spring')).toMatchObject({
			start: '2026-04-07',
			source: 'manual',
		});
	});

	it('1Q と 2Q の期間がなければ前期の期間を、3Q と 4Q の期間がなければ後期の期間を、推定として使う (作者の判断)', () => {
		const result = resolveAcademicTerms(2026, [
			stored('fall', '2026-09-24', '2027-01-21', 'manual'),
		]);
		expect(result.map((t) => [t.term, t.start, t.end, t.source])).toEqual([
			['full-year', '2026-04-01', '2027-01-21', 'estimated'],
			['spring', '2026-04-01', '2026-07-31', 'estimated'],
			['q1', '2026-04-01', '2026-07-31', 'estimated'],
			['q2', '2026-04-01', '2026-07-31', 'estimated'],
			// 後期が手入力なら、3Q と 4Q は、その手入力の期間を使う
			['fall', '2026-09-24', '2027-01-21', 'manual'],
			['q3', '2026-09-24', '2027-01-21', 'estimated'],
			['q4', '2026-09-24', '2027-01-21', 'estimated'],
		]);
	});

	it('クォーターの期間が保存されていれば、そちらを使う', () => {
		const result = resolveAcademicTerms(2026, [stored('q1', '2026-04-06', '2026-06-05', 'manual')]);
		expect(result.find((t) => t.term === 'q1')).toMatchObject({
			end: '2026-06-05',
			source: 'manual',
		});
		expect(result.find((t) => t.term === 'q2')).toMatchObject({
			end: '2026-07-31',
			source: 'estimated',
		});
	});

	it('通年は、前期の始まりから後期の終わりまでを推定として使う。保存されていればそちらを使う', () => {
		expect(resolveAcademicTerms(2026, []).find((t) => t.term === 'full-year')).toMatchObject({
			start: '2026-04-01',
			end: '2027-01-31',
			source: 'estimated',
		});
		const result = resolveAcademicTerms(2026, [
			stored('spring', '2026-04-06', '2026-07-24', 'auto'),
			stored('fall', '2026-09-24', '2027-01-21', 'auto'),
		]);
		expect(result.find((t) => t.term === 'full-year')).toMatchObject({
			start: '2026-04-06',
			end: '2027-01-21',
		});
		const manual = resolveAcademicTerms(2026, [
			stored('full-year', '2026-04-10', '2027-01-15', 'manual'),
		]);
		expect(manual.find((t) => t.term === 'full-year')).toMatchObject({
			start: '2026-04-10',
			source: 'manual',
		});
	});

	it('集中講義は、保存されていれば返し、なければ推定しない。開始日の順に並べる', () => {
		expect(resolveAcademicTerms(2026, []).map((t) => t.term)).not.toContain('summer-intensive');
		const result = resolveAcademicTerms(2026, [
			stored('summer-intensive', '2026-08-17', '2026-08-28', 'manual'),
		]);
		expect(result.map((t) => t.term)).toEqual([
			'full-year',
			'spring',
			'q1',
			'q2',
			'summer-intensive',
			'fall',
			'q3',
			'q4',
		]);
	});
});

describe('termsOn', () => {
	const terms = resolveAcademicTerms(2026, []);

	it('その日を期間に含む学期を返す。クォーターと通年も含む', () => {
		expect(termsOn(terms, '2026-10-07').sort()).toEqual(['fall', 'full-year', 'q3', 'q4']);
		// 期間の初日と最終日も含む
		expect(termsOn(terms, '2026-04-01')).toContain('spring');
		expect(termsOn(terms, '2026-07-31')).toContain('spring');
	});

	it('前期と後期の間の日は通年だけを、後期のあとの春休みはどの学期も含まない', () => {
		expect(termsOn(terms, '2026-08-20')).toEqual(['full-year']);
		expect(termsOn(terms, '2027-03-01')).toEqual([]);
	});
});
