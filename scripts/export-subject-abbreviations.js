import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

/**
 * @param {readonly string[]} names
 * @param {unknown} existing
 * @returns {Map<string, string>}
 */
export function mergeSubjectAbbreviations(names, existing) {
	if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
		throw new Error('略称ファイルは科目名と略称のJSONオブジェクトにしてください。');
	}
	/** @type {Map<string, string>} */
	const values = new Map();
	for (const [name, value] of Object.entries(existing)) {
		if (typeof value !== 'string' || value.trim().length > 100) {
			throw new Error(`略称は100文字以内の文字列にしてください: ${name}`);
		}
		values.set(name, value);
	}
	for (const name of names) if (!values.has(name)) values.set(name, '');
	return new Map([...values].sort(([a], [b]) => a.localeCompare(b, 'ja')));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const dbPath = process.argv[2];
	if (!dbPath)
		throw new Error('使い方: node scripts/export-subject-abbreviations.js <取得済みDBのパス>');
	const output = new URL('../apps/web/src/lib/server/subject-abbreviations.json', import.meta.url);
	const database = new DatabaseSync(resolve(dbPath), { readOnly: true });
	try {
		// 私的な利用者追加科目は公開ファイルに含めず、取り込んだシラバスの科目名だけを読む。
		const rows = database
			.prepare("SELECT DISTINCT name FROM subjects WHERE source = 'syllabus'")
			.all();
		const names = rows.map((row) => {
			if (typeof row['name'] !== 'string') throw new Error('科目名を読み取れませんでした。');
			return row['name'];
		});
		if (names.length === 0)
			throw new Error('取得済みのシラバス科目がありません。ファイルは変更しません。');
		/** @type {unknown} */
		const existing = existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) : {};
		const entries = mergeSubjectAbbreviations(names, existing);
		writeFileSync(output, `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`);
		console.log(`入力済みの略称を残して、${entries.size}科目の入力用ファイルを作りました。`);
	} finally {
		database.close();
	}
}
