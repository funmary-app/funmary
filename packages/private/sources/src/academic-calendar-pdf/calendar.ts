// 大学の学年暦の PDF を、ページごとの座標付きの文字と塗りの矩形から読む。
// 表は 1 行が 1 週 (日曜から土曜) で、セルの左に日付の数字、右に曜日ごとの授業の回数、中に行事名が書かれている。
// 授業の有無と区分は、セルの塗りの色で表される。色の意味は、表の上の凡例 (「1Q,3Q」「2Q, 4Q」) から読み、値を決め打ちしない。
// 凡例にない色は集中講義、塗りのないセルは授業のない日とみなす。定期試験の日も塗られているので、行事名で見分ける。
// 日付の数字は、全セルを暦と照らし合わせ、1 つでも合わなければ読み違えとして読み取りをやめる。
// PDF の取り出し (pdfjs-dist) とは分けてあり、この関数は、取り出した内容だけを入力にする純粋な関数。
import {
	addDays,
	isoWeekday,
	type CalendarDate,
	type SubstituteDay,
	type TermPeriod,
	type Weekday,
} from '@funmary/core';
import type { PdfTextItem } from '../timetable-pdf/grid.ts';

export interface PdfFillRect {
	/** 塗りの色 (#rrggbb)。模様の塗りは、pattern: で始まる模様ごとの値 */
	readonly fill: string;
	readonly x0: number;
	readonly y0: number;
	readonly x1: number;
	readonly y1: number;
}

export interface PdfPageContent {
	readonly texts: readonly PdfTextItem[];
	/** 描かれた順。あとのものが上に重なる */
	readonly fills: readonly PdfFillRect[];
}

export interface NoClassDayCandidate {
	readonly date: CalendarDate;
	/** セルに書かれた行事名 (例: 休講、年末年始休日)。なければ null */
	readonly label: string | null;
}

export type AcademicCalendarPdfResult =
	| {
			readonly kind: 'ok';
			readonly academicYear: number;
			/** 読み取れた学期だけ。前期、1Q、2Q、夏期集中、後期、3Q、4Q、冬期集中の順 */
			readonly terms: readonly TermPeriod[];
			readonly substituteDays: readonly SubstituteDay[];
			/**
			 * 前期と後期の授業期間の中で、塗りのない平日。祝日も含む (祝日と重なるものを除くのは、呼び出す側)
			 */
			readonly noClassDays: readonly NoClassDayCandidate[];
			/** 気になる点。結果は返すが、取り込む前に人が確かめる */
			readonly warnings: readonly string[];
	  }
	| { readonly kind: 'invalid'; readonly reason: string };

/** 1Q と 3Q (odd)、2Q と 4Q (even)、集中講義、授業なし */
type CellKind = 'odd' | 'even' | 'intensive' | 'none';

interface Day {
	readonly date: CalendarDate;
	readonly kind: CellKind;
	readonly labels: readonly string[];
	/** セルに書かれた授業の回数 */
	readonly count: number | null;
}

type PageReading =
	| {
			readonly kind: 'ok';
			readonly academicYear: number;
			readonly days: readonly Day[];
			readonly warnings: readonly string[];
	  }
	| { readonly kind: 'invalid'; readonly reason: string };

const NUMBER_PATTERN = /^\d{1,2}$/;
/** 日付の数字は列ごとに 1 年分 (50 個ほど) 同じ x に並ぶ。回数の数字はそれより少ない */
const MIN_DATES_PER_COLUMN = 40;
/** 日付の数字の x の揺れ (1 桁と 2 桁で 2 pt ほどずれる) */
const COLUMN_TOLERANCE = 3;
/** セルの下端は、日付の数字の下端より 4 pt ほど下にある */
const CELL_BOTTOM_BELOW_DATE = 5;
/** これより細い塗りは罫線とみなす */
const MIN_FILL_SIZE = 3;
const WHITE = '#ffffff';
const WEEKDAY_NAMES: Readonly<Record<string, Weekday>> = {
	月: 1,
	火: 2,
	水: 3,
	木: 4,
	金: 5,
	土: 6,
	日: 7,
};
const WEEKDAY_LABELS = ['', '月', '火', '水', '木', '金', '土', '日'];

/**
 * PDF のページごとの内容から、学年暦を読む。日本語の表題 (「2026年)度」) のページを読み、ほかに読めるページ (英語の版) があれば、セルの色を照らし合わせる。
 */
export function parseAcademicCalendarPages(
	pages: readonly PdfPageContent[],
): AcademicCalendarPdfResult {
	const mainIndex = pages.findIndex((page) => japaneseAcademicYear(page.texts) !== null);
	const main = pages[mainIndex];
	if (!main)
		return { kind: 'invalid', reason: '日本語の学年暦の表題 (「年度」) のページがありません' };
	const reading = readPage(main);
	if (reading.kind === 'invalid') return reading;

	const warnings = [...reading.warnings];
	const kinds = new Map(reading.days.map((day) => [day.date, day.kind]));
	pages.forEach((page, index) => {
		if (index === mainIndex) return;
		const other = readPage(page);
		if (other.kind === 'invalid' || other.academicYear !== reading.academicYear) return;
		const differing = other.days.filter((day) => kinds.get(day.date) !== day.kind);
		if (differing.length > 0) {
			warnings.push(
				`日本語のページと英語のページで、セルの色が違う日があります: ${differing.map((day) => day.date).join(', ')}`,
			);
		}
	});
	return summarize(reading.academicYear, reading.days, warnings);
}

function japaneseAcademicYear(texts: readonly PdfTextItem[]): number | null {
	for (const item of texts) {
		const match = /(\d{4})年\)?度/.exec(item.text);
		if (match) return Number(match[1]);
	}
	return null;
}

function academicYearOfPage(texts: readonly PdfTextItem[]): number | null {
	const japanese = japaneseAcademicYear(texts);
	if (japanese !== null) return japanese;
	for (const item of texts) {
		const match = /Academic Calendar\s*(\d{4})/i.exec(item.text);
		if (match) return Number(match[1]);
	}
	return null;
}

/** 凡例の文字を含む塗りの色 */
function legendFill(page: PdfPageContent, pattern: RegExp): string | null {
	const label = page.texts.find((item) => pattern.test(item.text.trim()));
	if (!label) return null;
	return fillAt(page.fills, label.x + 1, label.y + 1)?.fill ?? null;
}

function fillAt(fills: readonly PdfFillRect[], x: number, y: number): PdfFillRect | undefined {
	return fills.findLast(
		(rect) =>
			rect.x1 - rect.x0 >= MIN_FILL_SIZE &&
			rect.y1 - rect.y0 >= MIN_FILL_SIZE &&
			x >= rect.x0 &&
			x <= rect.x1 &&
			y >= rect.y0 &&
			y <= rect.y1,
	);
}

/** 日付の列の左端 (日付の数字の x の集まりの、左端)。日曜から土曜の順 */
function dateColumns(numbers: readonly PdfTextItem[]): number[] {
	const xs = numbers.map((item) => item.x).sort((a, b) => a - b);
	const clusters: number[][] = [];
	for (const x of xs) {
		const last = clusters.at(-1);
		if (last && x - (last.at(-1) ?? x) < COLUMN_TOLERANCE) last.push(x);
		else clusters.push([x]);
	}
	return clusters
		.filter((cluster) => cluster.length >= MIN_DATES_PER_COLUMN)
		.map((cluster) => cluster[0] ?? 0);
}

function readPage(page: PdfPageContent): PageReading {
	const academicYear = academicYearOfPage(page.texts);
	if (academicYear === null) return { kind: 'invalid', reason: '表題から年度を読めませんでした' };
	const odd = legendFill(page, /^1Q\s*,\s*3Q$/);
	const even = legendFill(page, /^2Q\s*,\s*4Q$/);
	if (odd === null || even === null || odd === even) {
		return { kind: 'invalid', reason: '凡例 (1Q,3Q と 2Q, 4Q の色) が見つかりません' };
	}

	const numbers = page.texts.filter((item) => NUMBER_PATTERN.test(item.text.trim()));
	const columns = dateColumns(numbers);
	if (columns.length !== 7) {
		return {
			kind: 'invalid',
			reason: `日付の列が 7 つ見つかりません (${columns.length} 列)`,
		};
	}
	const columnWidth = ((columns[6] ?? 0) - (columns[0] ?? 0)) / 6;
	const columnOf = (x: number) =>
		columns.findLastIndex((left) => x >= left - COLUMN_TOLERANCE + 0.5);
	const columnRight = (column: number) =>
		columns[column + 1] ?? (columns[column] ?? 0) + columnWidth;

	// 日付の数字: 列の左端にある数字。y の近いものを 1 つの週にまとめ、上から並べる
	const dateItems = numbers.filter((item) => {
		const column = columnOf(item.x);
		return column >= 0 && item.x - (columns[column] ?? 0) < COLUMN_TOLERANCE;
	});
	const rows: { y: number; cells: (PdfTextItem | undefined)[] }[] = [];
	for (const item of [...dateItems].sort((a, b) => b.y - a.y)) {
		const row = rows.find((r) => Math.abs(r.y - item.y) < COLUMN_TOLERANCE);
		if (row) row.cells[columnOf(item.x)] = item;
		else {
			const cells: (PdfTextItem | undefined)[] = [];
			cells[columnOf(item.x)] = item;
			rows.push({ y: item.y, cells });
		}
	}
	const firstRow = rows[0];
	const aprilFirstColumn = firstRow?.cells.findIndex((cell) => cell?.text.trim() === '1') ?? -1;
	if (!firstRow || aprilFirstColumn < 0) {
		return { kind: 'invalid', reason: '最初の週に 4 月 1 日が見つかりません' };
	}
	const firstSunday = addDays(`${academicYear}-04-01`, -aprilFirstColumn);
	const lastDate = `${academicYear + 1}-03-31`;
	const rowHeight = rows.length > 1 ? firstRow.y - (rows[1]?.y ?? 0) : 14;

	// 文字は、下端がそのセルの下端より上で、1 つ上の週のセルの下端より下にあるものを、そのセルのものとする
	const cellTexts = (rowIndex: number, column: number) => {
		const row = rows[rowIndex];
		if (!row) return [];
		const bottom = row.y - CELL_BOTTOM_BELOW_DATE;
		const top = (rows[rowIndex - 1]?.y ?? row.y + rowHeight) - CELL_BOTTOM_BELOW_DATE;
		const left = (columns[column] ?? 0) - COLUMN_TOLERANCE;
		const right = columnRight(column) - COLUMN_TOLERANCE;
		return page.texts.filter(
			(item) => item.y >= bottom && item.y < top && item.x >= left && item.x < right,
		);
	};

	const days: Day[] = [];
	const intensiveFills = new Set<string>();
	for (let rowIndex = 0; ; rowIndex++) {
		const weekStart = addDays(firstSunday, rowIndex * 7);
		if (weekStart > lastDate) break;
		const row = rows[rowIndex];
		if (!row) return { kind: 'invalid', reason: `${weekStart} の週の行が見つかりません` };
		for (let column = 0; column < 7; column++) {
			const date = addDays(weekStart, column);
			if (date > lastDate) break;
			const cell = row.cells[column];
			const dayOfMonth = String(Number(date.slice(8)));
			if (cell?.text.trim() !== dayOfMonth) {
				return {
					kind: 'invalid',
					reason: `${date} のセルの日付が ${cell?.text.trim() ?? '(なし)'} になっていて、暦と合いません`,
				};
			}
			const left = columns[column] ?? 0;
			const probe = fillAt(page.fills, (left + columnRight(column)) / 2, row.y + 3);
			const kind: CellKind = (() => {
				if (!probe || probe.fill === WHITE) return 'none';
				if (probe.fill === odd) return 'odd';
				if (probe.fill === even) return 'even';
				intensiveFills.add(probe.fill);
				return 'intensive';
			})();
			const texts = cellTexts(rowIndex, column).filter((item) => item !== cell);
			const countItem = texts.find(
				(item) => NUMBER_PATTERN.test(item.text.trim()) && item.x - left > columnWidth / 3,
			);
			days.push({
				date,
				kind,
				count: countItem ? Number(countItem.text.trim()) : null,
				labels: texts
					.filter((item) => !NUMBER_PATTERN.test(item.text.trim()))
					.sort((a, b) => b.y - a.y || a.x - b.x)
					.map((item) => item.text.trim()),
			});
		}
	}
	// 集中講義の緑のほかに色があれば、知らない区分が増えた可能性がある
	const warnings =
		intensiveFills.size > 1
			? [
					`凡例にない色が 2 つ以上あります (集中講義とみなしました): ${[...intensiveFills].join(', ')}`,
				]
			: [];
	return { kind: 'ok', academicYear, days, warnings };
}

function isExam(day: Day): boolean {
	return day.labels.some((label) => label.includes('定期試験'));
}

function substituteWeekday(day: Day): Weekday | null {
	for (const label of day.labels) {
		const match = /([月火水木金土日])曜振替授業/.exec(label);
		if (match) return WEEKDAY_NAMES[match[1] ?? ''] ?? null;
	}
	return null;
}

function period(term: TermPeriod['term'], days: readonly Day[]): TermPeriod[] {
	const first = days[0];
	const last = days.at(-1);
	return first && last ? [{ term, start: first.date, end: last.date }] : [];
}

function summarize(
	academicYear: number,
	days: readonly Day[],
	warnings: string[],
): AcademicCalendarPdfResult {
	// 前期は 4 月から 8 月、後期は 9 月から翌年 3 月の授業日
	const fallStart = `${academicYear}-09-01`;
	const classDays = days.filter(
		(day) => (day.kind === 'odd' || day.kind === 'even') && !isExam(day),
	);
	const springDays = classDays.filter((day) => day.date < fallStart);
	const fallDays = classDays.filter((day) => day.date >= fallStart);
	const intensiveDays = days.filter((day) => day.kind === 'intensive');
	const fallFirst = fallDays[0]?.date ?? fallStart;

	const semester = (
		name: '前期' | '後期',
		semesterDays: readonly Day[],
		terms: readonly [TermPeriod['term'], TermPeriod['term'], TermPeriod['term']],
	) => {
		const odd = semesterDays.filter((day) => day.kind === 'odd');
		const even = semesterDays.filter((day) => day.kind === 'even');
		const lastOdd = odd.at(-1)?.date;
		const firstEven = even[0]?.date;
		if (lastOdd && firstEven && lastOdd > firstEven) {
			warnings.push(
				`${name}の前半と後半のクォーターの色が入り混じっています (${firstEven} から ${lastOdd})`,
			);
		}
		return [...period(terms[0], semesterDays), ...period(terms[1], odd), ...period(terms[2], even)];
	};
	const terms = [
		...semester('前期', springDays, ['spring', 'q1', 'q2']),
		...period(
			'summer-intensive',
			intensiveDays.filter((day) => day.date < fallFirst),
		),
		...semester('後期', fallDays, ['fall', 'q3', 'q4']),
		...period(
			'winter-intensive',
			intensiveDays.filter((day) => day.date >= fallFirst),
		),
	];

	const substituteDays: SubstituteDay[] = [];
	for (const day of days) {
		const weekday = substituteWeekday(day);
		if (weekday === null) continue;
		if (day.kind === 'none') {
			warnings.push(`${day.date} は振替授業日と書かれていますが、授業日の色ではありません`);
			continue;
		}
		substituteDays.push({ date: day.date, weekday });
	}

	// 曜日ごとに授業の回数を数え、セルに書かれた回数と照らし合わせる
	const substitutes = new Map(substituteDays.map((day) => [day.date, day.weekday]));
	for (const semesterDays of [springDays, fallDays]) {
		const counts = new Map<Weekday, number>();
		for (const day of semesterDays) {
			const weekday = substitutes.get(day.date) ?? isoWeekday(day.date);
			const count = (counts.get(weekday) ?? 0) + 1;
			counts.set(weekday, count);
			if (day.count !== null && day.count !== count) {
				warnings.push(
					`${day.date} (${WEEKDAY_LABELS[weekday]}曜の授業) の回数は、数えると ${count} 回目ですが、PDF には ${day.count} と書かれています`,
				);
			}
		}
	}

	const inClassPeriod = (date: CalendarDate) =>
		terms.some(
			(term) =>
				(term.term === 'spring' || term.term === 'fall') && date >= term.start && date <= term.end,
		);
	const noClassDays = days
		.filter((day) => day.kind === 'none' && isoWeekday(day.date) <= 5 && inClassPeriod(day.date))
		.map((day) => ({ date: day.date, label: day.labels.length > 0 ? day.labels.join(' ') : null }));

	return { kind: 'ok', academicYear, terms, substituteDays, noClassDays, warnings };
}
