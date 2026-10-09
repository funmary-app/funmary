import { describe, expect, it } from 'vitest';
import { mergeSubjectAbbreviations } from './export-subject-abbreviations.js';

describe('略称入力用の科目一覧', () => {
	it('取得済みの全科目名を重複なしで並べ、入力済みの略称を残す', () => {
		expect(
			mergeSubjectAbbreviations(['科目B', '科目A', '科目B'], { 科目A: '略称A', 過年度の科目: '' }),
		).toEqual(
			new Map([
				['科目A', '略称A'],
				['科目B', ''],
				['過年度の科目', ''],
			]),
		);
	});

	it('略称ファイルの不正な値を、空欄に置き換えて上書きしない', () => {
		expect(() => mergeSubjectAbbreviations(['科目'], { 科目: 123 })).toThrow('略称');
		expect(() => mergeSubjectAbbreviations(['科目'], [])).toThrow('略称');
	});

	it('外部の科目名をMapのキーとして扱う', () => {
		expect(mergeSubjectAbbreviations(['__proto__', 'constructor'], {})).toEqual(
			new Map([
				['__proto__', ''],
				['constructor', ''],
			]),
		);
	});
});
