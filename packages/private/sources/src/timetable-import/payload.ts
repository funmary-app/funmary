// 学生ポータルの時間割 (Pt/TimeTable) を、利用者のブラウザで読み取って Funmary に渡すときの、内容 (ペイロード) の検査。
// ブラウザ側の読み取りは bookmarklet.ts のスクリプトが行い、内容は URL の # 以降 (サーバーに送られない) に入れて渡す。
// 内容は、利用者のブラウザから来る外の値なので、信用しない。形、文字数、URL の行き先を、ここで検査してから使う。
import type { Term } from '@funmary/core';
import * as v from 'valibot';

/** URL の # 以降として受け付ける、文字数の上限 (実物の時間割は、数 KB) */
const MAX_FRAGMENT_LENGTH = 200_000;
const MAX_CELLS = 200;

/** ポータルの開講期の記号 (data-term) から Term */
const TERMS = new Map<string, Term>([
	['10', 'spring'],
	['20', 'fall'],
	['11', 'q1'],
	['12', 'q2'],
	['21', 'q3'],
	['22', 'q4'],
	['00', 'full-year'],
]);

export interface ImportedCell {
	/** シラバスの番号 (授業コード) */
	readonly lessonId: string;
	readonly year: number;
	readonly term: Term;
	/** 1 が月曜。集中講義など、表の枠にないコマは null */
	readonly weekday: number | null;
	readonly period: number | null;
	readonly room: string | null;
	readonly teachers: readonly string[];
	readonly name: string;
	/** HOPE のコースの URL。hope.fun.ac.jp の https のものだけ */
	readonly hopeUrl: string | null;
}

export type ImportPayloadResult =
	| {
			readonly kind: 'ok';
			readonly cells: readonly ImportedCell[];
			/** 形が合わずに捨てたコマの数 */
			readonly rejected: number;
	  }
	| { readonly kind: 'invalid'; readonly reason: string };

const clean = (text: string, max: number) =>
	text
		.replace(/\p{Cc}/gu, '')
		.trim()
		.slice(0, max);

/** コマの名前の末尾の、(教室)(前期|後期) から、教室を取り出す。例: コミュニケーションII1-J(494C&D)(後期) */
export function roomFromLabel(label: string): string | null {
	const match = /[(（]([^()（）]+)[)）]\s*[(（](?:前期|後期)[)）]\s*$/.exec(label.trim());
	return match?.[1] ? clean(match[1], 100) : null;
}

const CellSchema = v.object({
	l: v.pipe(v.string(), v.regex(/^\d{1,10}$/)),
	y: v.pipe(v.number(), v.integer(), v.minValue(2000), v.maxValue(2100)),
	t: v.string(),
	w: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(7))),
	p: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(6))),
	r: v.optional(v.string(), ''),
	s: v.optional(v.string(), ''),
	n: v.pipe(v.string(), v.minLength(1)),
	h: v.optional(v.string(), ''),
	x: v.optional(v.string(), ''),
});

const PayloadSchema = v.object({
	v: v.literal(1),
	c: v.pipe(v.array(v.unknown()), v.maxLength(MAX_CELLS)),
});

const HOPE_URL = /^https:\/\/hope\.fun\.ac\.jp\/[^\s]*$/;

export function parseImportPayload(input: unknown): ImportPayloadResult {
	const parsed = v.safeParse(PayloadSchema, input);
	if (!parsed.success) return { kind: 'invalid', reason: '内容の形が違います' };

	const cells: ImportedCell[] = [];
	const seen = new Set<string>();
	let rejected = 0;
	for (const raw of parsed.output.c) {
		const cell = v.safeParse(CellSchema, raw);
		const term = cell.success ? TERMS.get(cell.output.t) : undefined;
		if (!cell.success || !term) {
			rejected++;
			continue;
		}
		const c = cell.output;
		const key = `${c.l}\u0000${c.y}\u0000${c.w}\u0000${c.p}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const room = clean(c.r, 100) || roomFromLabel(c.x);
		const hopeUrl = clean(c.h, 500);
		cells.push({
			lessonId: c.l,
			year: c.y,
			term,
			weekday: c.w,
			period: c.p,
			room: room || null,
			teachers: c.s
				.split(/[,，、]/)
				.map((name) => clean(name, 50))
				.filter((name) => name !== '')
				.slice(0, 10),
			name: clean(c.n, 200),
			hopeUrl: HOPE_URL.test(hopeUrl) ? hopeUrl : null,
		});
	}
	return { kind: 'ok', cells, rejected };
}

/** URL の # 以降 (base64url にした JSON) を、検査して読む */
export function decodeImportFragment(fragment: string): ImportPayloadResult {
	const text = fragment.replace(/^#/, '').replace(/^d=/, '');
	if (text === '') return { kind: 'invalid', reason: '内容がありません' };
	if (text.length > MAX_FRAGMENT_LENGTH) return { kind: 'invalid', reason: '内容が大きすぎます' };
	if (!/^[A-Za-z0-9_-]+$/.test(text)) return { kind: 'invalid', reason: '内容の形が違います' };
	try {
		const json = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(text, 'base64url'));
		return parseImportPayload(JSON.parse(json) as unknown);
	} catch {
		return { kind: 'invalid', reason: '内容を読めませんでした' };
	}
}

/** テストと、手元の確認のために、内容を # 以降の形にする (ブラウザ側は bookmarklet.ts のスクリプトが同じ形にする) */
export function encodeImportPayload(payload: unknown): string {
	return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}
