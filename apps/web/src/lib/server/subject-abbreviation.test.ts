import { describe, expect, it } from 'vitest';
import { resolveSubjectAbbreviation, parseAbbreviation } from './subject-abbreviation.ts';

describe('時間割の略称', () => {
	const defaults = new Map([
		['架空の長い授業名', '長い授業'],
		['略せない授業', ''],
	]);

	it('未保存ならデフォルト略称を使い、空欄や未掲載なら略称なしにする', () => {
		expect(resolveSubjectAbbreviation('架空の長い授業名', undefined, defaults)).toBe('長い授業');
		expect(resolveSubjectAbbreviation('略せない授業', undefined, defaults)).toBe('');
		expect(resolveSubjectAbbreviation('追加した授業', undefined, defaults)).toBe('');
	});

	it('個人の保存値を優先し、空欄ならデフォルトに戻さない', () => {
		expect(resolveSubjectAbbreviation('架空の長い授業名', '個人の略称', defaults)).toBe(
			'個人の略称',
		);
		expect(resolveSubjectAbbreviation('架空の長い授業名', '', defaults)).toBe('');
	});

	it('前後の空白を除き、空欄は保存できる', () => {
		expect(parseAbbreviation(' 略称 ')).toEqual({ ok: true, value: '略称' });
		expect(parseAbbreviation('  ')).toEqual({ ok: true, value: '' });
	});

	it('入力の欠落、ファイル、長すぎる値は保存しない', () => {
		expect(parseAbbreviation(null).ok).toBe(false);
		expect(parseAbbreviation(new File(['test'], 'test.txt')).ok).toBe(false);
		expect(parseAbbreviation('あ'.repeat(101)).ok).toBe(false);
	});
});
