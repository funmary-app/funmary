// 授業時間割の PDF (大学が学期ごとに配る、A3 横の 1 ページの表) を、座標つきの文字の配列から読む。
// 表は、曜日 (月から金) ごとに 3 つの列 (科目、クラス、部屋) があり、行は 1 限から 6 限。
// 文字の左端の x は列ごとに揃っているので、x の分布から列の位置を見つけ、見出しの座標には頼らない。
// 時限の行は、左端の「N時限」の y で区切る。1 つのコマに複数の科目が縦に並ぶ。
// PDF の取り出し (pdfjs-dist) とは分けてあり、この関数は、文字の配列だけを入力にする純粋な関数。
// 科目 (シラバス) との照合は、ここではしない。

export interface PdfTextItem {
	readonly text: string;
	/** 文字の左端 (PDF の座標。右が大きい) */
	readonly x: number;
	/** 文字の下端 (PDF の座標。上が大きい) */
	readonly y: number;
	readonly height: number;
	/** 文字の幅。同じ行の、隣り合う断片をつなげるときに使う。分からなければ省く */
	readonly width?: number;
}

export type Quarter = 'q1' | 'q2' | 'q3' | 'q4';

export interface TimetablePdfEntry {
	/** 1 が月曜、5 が金曜 */
	readonly weekday: number;
	/** 1 から 6 */
	readonly period: number;
	/** 1Q から 4Q の科目なら、そのクォーター */
	readonly quarter: Quarter | null;
	/** 科目名 (最初のカッコの前まで) */
	readonly subject: string;
	/** 教員 (カッコの中を、区切りで分けたもの) */
	readonly teachers: readonly string[];
	/** 科目の欄の全文 (クォーターの接頭辞と、注記を除く) */
	readonly title: string;
	/** クラス (例: 1-IJKL、2-EF,3-GHI、1～4、M1,2)。書かれていなければ null */
	readonly classes: string | null;
	readonly rooms: readonly string[];
	/** ※ で始まる注記 (例: ※旧 ソフトウェア設計論Ⅰ) */
	readonly notes: readonly string[];
}

export interface TimetablePdfIntensive {
	readonly subject: string;
	readonly classes: string | null;
	readonly teachers: readonly string[];
	/** 行の全文 */
	readonly title: string;
}

/** 読み取りの質を表す数値。PDF の作りが変わったときに、読み違えが増えたことに気づくために使う */
export interface TimetablePdfQuality {
	readonly entryCount: number;
	/** クラスが付いたコマの割合 (0 から 1) */
	readonly classRatio: number;
	/** 部屋が付いたコマの割合 (0 から 1) */
	readonly roomRatio: number;
	/** 列の位置の重みのうち、最も小さいもの。小さいと、列の位置の判定が不確か */
	readonly weakestAnchorWeight: number;
}

export type TimetablePdfResult =
	| {
			readonly kind: 'ok';
			readonly term: 'spring' | 'fall' | null;
			/** 表題の年度 (令和 8 年度 なら 2026) */
			readonly academicYear: number | null;
			/** 右上の更新日 (YYYY-MM-DD) */
			readonly updatedOn: string | null;
			readonly entries: readonly TimetablePdfEntry[];
			readonly intensive: readonly TimetablePdfIntensive[];
			readonly quality: TimetablePdfQuality;
			/** 気になる点 (質が下がっている可能性、読めなかった行など)。結果は返すが、取り込む前に人が確かめる */
			readonly warnings: readonly string[];
	  }
	| { readonly kind: 'invalid'; readonly reason: string };

const PERIODS = 6;
const DAYS = 5;
const MAX_TEXT_LENGTH = 300;

/**
 * 読み取りの許容範囲。PDF の作り方が少し変わっても動くよう、値は設定として持つ。
 * 列の位置は、固定の閾値ではなく、「その x に揃った文字の数」(重み) の順位で決めるので、表の大きさや文字の数が変わっても、上位 15 個を選べる。
 */
export interface TimetablePdfOptions {
	/** 列の左端の x として認める、同じ x の文字の最小の数 (重みの下限) */
	readonly minAnchorWeight: number;
	/** 同じ列とみなす、x の揺れ */
	readonly xTolerance: number;
	/** 同じ行とみなす、y の差 */
	readonly lineTolerance: number;
	/** 時限の行の境界に足す余裕 (行の最初の文字が、見出しの y より少し上にあることがある) */
	readonly bandMargin: number;
	/** 集中講義の欄の、見出しから下に見る範囲 */
	readonly intensiveDepth: number;
	/** 同じ行で、隣り合う断片をつなげる、文字の間の最大の隙間 */
	readonly adjacentGap: number;
	/** これより少ないコマしか読めなかったら、質が下がったとして警告する */
	readonly minEntries: number;
	/** クラス、部屋が付いたコマの割合が、これより低ければ、質が下がったとして警告する */
	readonly minFilledRatio: number;
}

export const DEFAULT_TIMETABLE_PDF_OPTIONS: TimetablePdfOptions = {
	minAnchorWeight: 3,
	xTolerance: 2.5,
	lineTolerance: 1.2,
	bandMargin: 3,
	intensiveDepth: 25,
	adjacentGap: 4,
	minEntries: 100,
	minFilledRatio: 0.8,
};

const nfkc = (text: string) => text.normalize('NFKC');
const clean = (text: string) =>
	text
		.replace(/\p{Cc}/gu, '')
		.trim()
		.slice(0, MAX_TEXT_LENGTH);

interface Line {
	readonly text: string;
	readonly y: number;
}

/** 同じ列の文字を、同じ行 (y がほぼ同じ) ごとにまとめ、上から下に並べる */
function toLines(items: readonly PdfTextItem[], options: TimetablePdfOptions): Line[] {
	const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
	const lines: { y: number; parts: PdfTextItem[] }[] = [];
	for (const item of sorted) {
		const last = lines.at(-1);
		if (last && Math.abs(last.y - item.y) <= options.lineTolerance) last.parts.push(item);
		else lines.push({ y: item.y, parts: [item] });
	}
	return lines.map((line) => ({
		y: line.y,
		text: line.parts
			.sort((a, b) => a.x - b.x)
			.map((p) => p.text)
			.join(''),
	}));
}

/**
 * 同じ行で、ほぼ隙間なく並んでいる断片を、1 つにつなげる (フォントが切り替わると、1 行が複数の断片に分かれるため)。
 * 幅が分からない断片は、つなげない
 */
function mergeAdjacent(items: readonly PdfTextItem[], options: TimetablePdfOptions): PdfTextItem[] {
	const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
	const merged: PdfTextItem[] = [];
	for (const item of sorted) {
		const last = merged.at(-1);
		if (
			last &&
			last.width !== undefined &&
			Math.abs(last.y - item.y) <= options.lineTolerance &&
			item.x - (last.x + last.width) <= options.adjacentGap
		) {
			merged[merged.length - 1] = {
				...last,
				text: last.text + item.text,
				width: item.x + (item.width ?? 0) - last.x,
			};
		} else merged.push(item);
	}
	return merged;
}

/** 列の左端の位置と、その重み (その位置に揃った文字の数) */
interface Anchor {
	readonly x: number;
	readonly weight: number;
}

/**
 * x の分布から、列の左端の位置 (x の小さい順) を見つける。
 * 近い x は同じ列の揺れとしてまとめ、重みの大きい順に、必要な数 (15 個) だけ選ぶ。
 * 重みが下限に届かない位置は、候補にしない。偶然に揃った文字 (見出しの注記など) は、重みが小さいので、選ばれない
 */
function findAnchors(
	items: readonly PdfTextItem[],
	options: TimetablePdfOptions,
	wanted: number,
): Anchor[] {
	const counts = new Map<number, number>();
	for (const item of items) {
		const x = Math.round(item.x);
		counts.set(x, (counts.get(x) ?? 0) + 1);
	}
	const clusters: { x: number; count: number }[] = [];
	for (const [x, count] of [...counts].sort((a, b) => a[0] - b[0])) {
		const last = clusters.at(-1);
		if (last && x - last.x <= options.xTolerance) {
			if (count > last.count) last.x = x;
			last.count += count;
		} else clusters.push({ x, count });
	}
	return clusters
		.filter((c) => c.count >= options.minAnchorWeight)
		.sort((a, b) => b.count - a.count || a.x - b.x)
		.slice(0, wanted)
		.map((c) => ({ x: c.x, weight: c.count }))
		.sort((a, b) => a.x - b.x);
}

/** 左端の、時限ごとの時刻の見出し (9:00、10:30、19:40 と、間の -) */
const TIME_LABEL = /^(\d{1,2}:\d{2}|-)$/;

const QUARTER_PREFIX = /^\s*([1-4])\s*Q\s*[:：]\s*/;

function splitQuarter(text: string): { quarter: Quarter | null; rest: string } {
	const match = QUARTER_PREFIX.exec(nfkc(text));
	if (!match) return { quarter: null, rest: text.trim() };
	// 全角の数字や記号が混じっていても、先頭の同じ長さを削る
	const rest = text.replace(/^\s*[1-4１-４]\s*[QＱ]\s*[:：]\s*/, '').trim();
	return { quarter: `q${match[1]}` as Quarter, rest };
}

/** 科目の欄の全文から、科目名と、カッコの中の教員を取り出す */
function splitTitle(title: string): { subject: string; teachers: string[] } {
	const subject = clean(title.split(/[（(]/)[0] ?? '');
	const teachers: string[] = [];
	for (const group of title.matchAll(/[（(]([^）)]*)[）)]?/g)) {
		for (const name of (group[1] ?? '').split(/[,，、･・]/)) {
			// 「佐藤直ほか」の「ほか」と「他」は、教員名ではない
			const trimmed = name.replace(/\s*(ほか|他)\s*$/, '').trim();
			if (trimmed !== '') teachers.push(trimmed);
		}
	}
	return { subject, teachers };
}

/** クラスの表記をそろえる。全角の数字や英字は半角に、範囲の波線 (~ 〜 ～) は ～ にする */
const normalizeClasses = (text: string): string =>
	nfkc(text)
		.replace(/[~〜～]/g, '～')
		.trim();

const splitRooms = (text: string): string[] =>
	nfkc(text)
		.split(/[,、･・/／]\s*/)
		.map((room) => room.trim())
		.filter((room) => room !== '');

/** 開きカッコの数 - 閉じカッコの数 */
const parenBalance = (text: string) =>
	(text.match(/[（(]/g)?.length ?? 0) - (text.match(/[）)]/g)?.length ?? 0);

interface DraftEntry {
	lines: Line[];
	notes: string[];
	classLines: Line[];
	roomLines: Line[];
	balance: number;
}

const draftTop = (draft: DraftEntry) => draft.lines[0]!.y;
const draftBottom = (draft: DraftEntry) => draft.lines.at(-1)!.y;

/** y から、科目の行の範囲 (上端から下端) までの距離。範囲の中なら 0 */
function distance(draft: DraftEntry, y: number): number {
	const all = [...draft.lines.map((l) => l.y), ...(draft.notes.length ? [] : [])];
	void all;
	const top = draftTop(draft);
	const bottom = draftBottom(draft);
	if (y > top) return y - top;
	if (y < bottom) return bottom - y;
	return 0;
}

function parseCell(
	subjectLines: readonly Line[],
	classLines: readonly Line[],
	roomLines: readonly Line[],
	weekday: number,
	period: number,
	warnings: string[],
): TimetablePdfEntry[] {
	const drafts: DraftEntry[] = [];
	for (const line of subjectLines) {
		const trimmed = line.text.trim();
		if (trimmed === '') continue;
		const current = drafts.at(-1);
		if (trimmed.startsWith('※') && current) {
			// ※ で始まる行は、前の科目の注記。続きのカッコの中の文は、教員として扱わない
			current.notes.push(clean(trimmed));
			current.lines.push(line);
		} else if (current && current.balance > 0) {
			current.lines.push(line);
			current.balance += parenBalance(trimmed);
			current.notes = current.notes.map((n) => n);
			continue;
		} else {
			drafts.push({
				lines: [line],
				notes: [],
				classLines: [],
				roomLines: [],
				balance: parenBalance(trimmed),
			});
		}
	}
	if (drafts.length === 0) {
		if (classLines.length > 0 || roomLines.length > 0) {
			warnings.push(`${weekday} 曜日の ${period} 限に、科目のないクラスか部屋があります`);
		}
		return [];
	}

	const assign = (lines: readonly Line[], target: 'classLines' | 'roomLines') => {
		for (const line of lines) {
			let best = drafts[0]!;
			let bestDistance = Infinity;
			for (const draft of drafts) {
				const d = distance(draft, line.y);
				// 同じ距離なら、上の科目 (先に出てきたもの) にする
				if (d < bestDistance) {
					best = draft;
					bestDistance = d;
				}
			}
			best[target].push(line);
		}
	};
	assign(classLines, 'classLines');
	assign(roomLines, 'roomLines');

	return drafts.map((draft): TimetablePdfEntry => {
		// ※ の注記に当たる行を除いた、科目の全文
		const noteYs = new Set(
			draft.lines.filter((l) => l.text.trim().startsWith('※')).map((l) => l.y),
		);
		const body = draft.lines
			.filter((l) => !noteYs.has(l.y))
			.map((l) => l.text.trim())
			.join('');
		const { quarter, rest } = splitQuarter(body);
		const { subject, teachers } = splitTitle(rest);
		const classes = draft.classLines.map((l) => normalizeClasses(l.text)).filter(Boolean);
		return {
			weekday,
			period,
			quarter,
			subject,
			teachers,
			title: clean(rest),
			classes: classes.length > 0 ? classes.join(',') : null,
			rooms: splitRooms(draft.roomLines.map((l) => l.text.trim()).join(' ')),
			notes: draft.notes,
		};
	});
}

/** 「・科目名 クラス（教員）」の 1 件。隣り合う列がつながって、1 行に複数入ることがあるので、全体から探す */
const INTENSIVE_ENTRY = /・\s*([^・（(]+?)\s+([0-9１-９][^\s（(]*)\s*[（(]([^）)]*)[）)]/g;

/** 集中講義の行から、科目を取り出す。「・」で始まるのに 1 件も読めなければ、null */
function parseIntensive(text: string): TimetablePdfIntensive[] | null {
	const trimmed = clean(text);
	const found = [...trimmed.matchAll(INTENSIVE_ENTRY)].map((match): TimetablePdfIntensive => {
		const { teachers } = splitTitle(`x（${match[3] ?? ''}）`);
		return {
			subject: clean(match[1] ?? ''),
			classes: normalizeClasses(match[2] ?? '') || null,
			teachers,
			title: clean(match[0]),
		};
	});
	return found.length > 0 ? found : null;
}

function readHeading(items: readonly PdfTextItem[]): {
	term: 'spring' | 'fall' | null;
	academicYear: number | null;
	updatedOn: string | null;
} {
	let term: 'spring' | 'fall' | null = null;
	let academicYear: number | null = null;
	let updatedOn: string | null = null;
	for (const item of items) {
		const text = nfkc(item.text);
		const heading = /令和\s*(\d+)\s*年度\s*(前期|後期)/.exec(text);
		if (heading) {
			academicYear = 2018 + Number(heading[1]);
			term = heading[2] === '前期' ? 'spring' : 'fall';
		}
		const date = /^\s*(\d{4})\/(\d{1,2})\/(\d{1,2})\s*$/.exec(text);
		if (date) {
			updatedOn = `${date[1]}-${date[2]!.padStart(2, '0')}-${date[3]!.padStart(2, '0')}`;
		}
	}
	return { term, academicYear, updatedOn };
}

export function parseTimetableItems(
	input: readonly PdfTextItem[],
	overrides: Partial<TimetablePdfOptions> = {},
): TimetablePdfResult {
	const options: TimetablePdfOptions = { ...DEFAULT_TIMETABLE_PDF_OPTIONS, ...overrides };
	const items = input
		.filter((i) => Number.isFinite(i.x) && Number.isFinite(i.y) && i.text.trim() !== '')
		.map((i) => ({ ...i, text: i.text.replace(/\p{Cc}/gu, '') }));
	if (items.length === 0) return { kind: 'invalid', reason: '文字がありません' };

	// 時限の見出し (左端の「N時限」)
	const periodY = new Map<number, number>();
	for (const item of items) {
		const match = /^([1-6])時限$/.exec(nfkc(item.text).trim());
		if (match && !periodY.has(Number(match[1]))) periodY.set(Number(match[1]), item.y);
	}
	if (periodY.size < PERIODS) {
		return { kind: 'invalid', reason: '1 限から 6 限までの見出しが見つかりません' };
	}
	for (let p = 1; p < PERIODS; p++) {
		if (!(periodY.get(p)! > periodY.get(p + 1)!)) {
			return { kind: 'invalid', reason: '時限の見出しの並びが上から下になっていません' };
		}
	}

	// 集中講義の欄の見出しと、クラス区分の位置
	const intensiveHeading = items.find((i) => i.text.includes('【集中講義】'));
	const classDivision = items.find((i) => i.text.includes('【クラス区分】'));
	const gridBottom = intensiveHeading
		? intensiveHeading.y + options.bandMargin
		: periodY.get(PERIODS)! - 40;

	const top = periodY.get(1)! + options.bandMargin;
	const gridItems = items.filter(
		(i) => i.y <= top && i.y > gridBottom && i.x > 15 && !TIME_LABEL.test(nfkc(i.text).trim()),
	);
	const anchors = findAnchors(gridItems, options, DAYS * 3);
	if (anchors.length !== DAYS * 3) {
		return {
			kind: 'invalid',
			reason: `列の位置を ${DAYS * 3} 個見つける必要がありますが、${anchors.length} 個でした`,
		};
	}

	/** 列 (曜日と、科目、クラス、部屋のどれか) ごとの文字 */
	const columns = new Map<string, PdfTextItem[]>();
	for (const item of gridItems) {
		let index = -1;
		for (let i = 0; i < anchors.length; i++) {
			if (item.x >= anchors[i]!.x - options.xTolerance) index = i;
		}
		if (index < 0) continue;
		const key = `${Math.floor(index / 3)}:${index % 3}`;
		(columns.get(key) ?? columns.set(key, []).get(key)!).push(item);
	}

	const warnings: string[] = [];
	const entries: TimetablePdfEntry[] = [];
	for (let day = 0; day < DAYS; day++) {
		for (let period = 1; period <= PERIODS; period++) {
			const upper = periodY.get(period)! + options.bandMargin;
			const lower = period < PERIODS ? periodY.get(period + 1)! + options.bandMargin : gridBottom;
			const inBand = (key: string) =>
				toLines(
					(columns.get(`${day}:${key}`) ?? []).filter((i) => i.y <= upper && i.y > lower),
					options,
				);
			entries.push(...parseCell(inBand('0'), inBand('1'), inBand('2'), day + 1, period, warnings));
		}
	}

	// 集中講義
	const intensive: TimetablePdfIntensive[] = [];
	if (intensiveHeading) {
		const limitX = classDivision ? classDivision.x : Infinity;
		const region = mergeAdjacent(
			items.filter(
				(i) =>
					i.y <= intensiveHeading.y + options.bandMargin &&
					i.y > intensiveHeading.y - options.intensiveDepth &&
					i.x < limitX,
			),
			options,
		).filter((i) => i.text.trim().startsWith('・'));
		for (const item of region) {
			const parsed = parseIntensive(item.text);
			if (parsed) intensive.push(...parsed);
			else warnings.push(`集中講義の行を読めませんでした: ${clean(item.text)}`);
		}
	}

	// 読み取りの質。PDF の作りが変わって、読み違えが増えていないかを、数値で見る
	const ratio = (count: number) => (entries.length === 0 ? 0 : count / entries.length);
	const quality: TimetablePdfQuality = {
		entryCount: entries.length,
		classRatio: ratio(entries.filter((e) => e.classes !== null).length),
		roomRatio: ratio(entries.filter((e) => e.rooms.length > 0).length),
		weakestAnchorWeight: Math.min(...anchors.map((a) => a.weight)),
	};
	if (quality.entryCount < options.minEntries) {
		warnings.push(
			`読めたコマが ${quality.entryCount} 件しかありません (通常は 200 件ほど)。PDF の作りが変わった可能性があります`,
		);
	}
	if (quality.classRatio < options.minFilledRatio) {
		warnings.push(`クラスが付いたコマの割合が低いです (${percent(quality.classRatio)})`);
	}
	if (quality.roomRatio < options.minFilledRatio) {
		warnings.push(`部屋が付いたコマの割合が低いです (${percent(quality.roomRatio)})`);
	}

	return { kind: 'ok', ...readHeading(items), entries, intensive, quality, warnings };
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
