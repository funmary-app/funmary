// 公開シラバスの検索結果 (Lesson/SyllabusList) を解析する。
// 列は位置ではなく、data-col-responsive-title 属性の名前で読む。ページ送りは ASP.NET の __doPostBack なので、次のページを頼むときに送る hidden の値も、ここで取り出す。
import type { Element, Root } from 'hast';
import { fromHtml } from 'hast-util-from-html';
import { select, selectAll } from 'hast-util-select';
import { toText } from 'hast-util-to-text';
import { normalizeLabel } from '../html/table.ts';

export interface SyllabusListRow {
	/** シラバスの番号 (授業コード) */
	readonly lessonId: string;
	readonly year: number;
	readonly name: string;
	readonly courseEnglish: string | null;
	readonly teacher: string | null;
	readonly lessonType: string | null;
}

export type SyllabusListResult =
	| {
			readonly kind: 'ok';
			/** "検索結果(341)" の件数 */
			readonly total: number;
			readonly rows: readonly SyllabusListRow[];
			/** 形が合わずに捨てた行の数 */
			readonly rejectedRows: number;
			/** 次のページを頼むときに、そのまま送る hidden の値 */
			readonly hidden: ReadonlyMap<string, string>;
			/** ページ送りに出ている、最大のページ番号 */
			readonly maxPageLinked: number;
	  }
	| { readonly kind: 'invalid'; readonly reason: string };

const MAX_TEXT_LENGTH = 300;

const clean = (text: string) =>
	text
		.replace(/\p{Cc}/gu, '')
		.trim()
		.slice(0, MAX_TEXT_LENGTH);

function cellsByName(row: Element): Map<string, string> {
	const cells = new Map<string, string>();
	for (const child of row.children) {
		if (child.type !== 'element' || child.tagName !== 'td') continue;
		const title = child.properties['dataColResponsiveTitle'];
		if (typeof title === 'string') cells.set(normalizeLabel(title), clean(toText(child)));
	}
	return cells;
}

export function parseSyllabusList(html: string): SyllabusListResult {
	let tree: Root;
	try {
		tree = fromHtml(html);
	} catch {
		return { kind: 'invalid', reason: 'HTML を読めませんでした' };
	}

	const headings = selectAll('h1, h2, h3, h4', tree).map((h) => toText(h));
	const totalText = headings
		.map((h) => /検索結果\s*[(（]\s*(\d+)\s*[)）]/.exec(h)?.[1])
		.find(Boolean);
	if (totalText === undefined) return { kind: 'invalid', reason: '検索結果の件数がありません' };

	const hidden = new Map<string, string>();
	for (const input of selectAll('input[type="hidden"]', tree)) {
		const name = input.properties['name'];
		if (typeof name === 'string') {
			const value = input.properties['value'];
			hidden.set(name, typeof value === 'string' ? value : '');
		}
	}

	const rows: SyllabusListRow[] = [];
	let rejectedRows = 0;
	const grid = select('table[id$="GridView"]', tree);
	for (const row of grid ? selectAll('tr', grid) : []) {
		const cells = cellsByName(row);
		if (!cells.has(normalizeLabel('授業コード'))) continue;
		const lessonId = cells.get('授業コード') ?? '';
		const year = Number(cells.get('履修年度'));
		const name = cells.get('授業科目名') ?? '';
		if (!/^\d{1,10}$/.test(lessonId) || !Number.isInteger(year) || year < 2000 || name === '') {
			rejectedRows++;
			continue;
		}
		rows.push({
			lessonId,
			year,
			name,
			courseEnglish: cells.get('Course') || null,
			teacher: cells.get('担当教員名') || null,
			lessonType: cells.get('授業形態') || null,
		});
	}

	const pageNumbers = [...html.matchAll(/'Page\$(\d+)'/g)].map((m) => Number(m[1]));
	return {
		kind: 'ok',
		total: Number(totalText),
		rows,
		rejectedRows,
		hidden,
		maxPageLinked: pageNumbers.length > 0 ? Math.max(...pageNumbers) : 1,
	};
}

export interface SearchForm {
	/** hidden の値。次の検索や、ページ送りの POST に、そのまま送る */
	readonly hidden: ReadonlyMap<string, string>;
	/** 年度の選択肢 (画面に出ているもの) */
	readonly years: readonly number[];
	readonly yearField: string;
	readonly submitField: string;
	readonly submitValue: string;
}

export type SearchFormResult =
	| { readonly kind: 'ok'; readonly form: SearchForm }
	| { readonly kind: 'invalid'; readonly reason: string };

const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/** 検索画面のフォーム (年度の選択肢と、検索ボタン) を読む */
export function parseSearchForm(html: string): SearchFormResult {
	let tree: Root;
	try {
		tree = fromHtml(html);
	} catch {
		return { kind: 'invalid', reason: 'HTML を読めませんでした' };
	}
	const hidden = new Map<string, string>();
	for (const input of selectAll('input[type="hidden"]', tree)) {
		const name = str(input.properties['name']);
		if (name) hidden.set(name, str(input.properties['value']) ?? '');
	}
	if (!hidden.has('__VIEWSTATE')) return { kind: 'invalid', reason: '__VIEWSTATE がありません' };

	const yearSelect = select('select[name$="param_Syllabus_year_eq"]', tree);
	const yearField = yearSelect && str(yearSelect.properties['name']);
	const years = yearSelect
		? selectAll('option', yearSelect)
				.map((option) => Number(str(option.properties['value'])))
				.filter((year) => Number.isInteger(year) && year >= 2000)
		: [];
	const submit = select('input[type="submit"][name$="SearchButton"]', tree);
	const submitField = submit && str(submit.properties['name']);
	if (!yearField || years.length === 0 || !submitField) {
		return { kind: 'invalid', reason: '年度の選択肢か検索ボタンがありません' };
	}
	return {
		kind: 'ok',
		form: {
			hidden,
			years,
			yearField,
			submitField,
			submitValue: str(submit.properties['value']) ?? '',
		},
	};
}
