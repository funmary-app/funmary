// 学年暦の PDF から、ページごとに文字と塗りの矩形を取り出す。pdfjs-dist の描画命令の一覧 (operator list) を読み、塗りの色と、座標の変換 (cm)、その保存と復元 (q と Q) をたどる。文字のデータが入った PDF が対象で、画像の PDF は読めない。
// 取り出した内容は calendar.ts に渡す。管理者の取り込みと、学年暦の定期処理で使う。
import { createHash } from 'node:crypto';
import { readTextItems, withPdfDocument, type Pdfjs } from '../pdf/document.ts';
import {
	parseAcademicCalendarPages,
	type AcademicCalendarPdfResult,
	type PdfFillRect,
	type PdfPageContent,
} from './calendar.ts';

/** PDF の大きさの上限 (実物は 300 KB 前後) */
const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** 実物は日本語と英語の 2 ページ。ページが多いものは、別の種類の PDF とみなす */
const MAX_PAGES = 4;

export type ExtractPagesResult =
	| { readonly kind: 'ok'; readonly pages: readonly PdfPageContent[] }
	| { readonly kind: 'invalid'; readonly reason: string };

type Matrix = readonly [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m を当ててから ctm を当てる変換 (PDF の cm と同じ順) */
function multiply(m: Matrix, ctm: Matrix): Matrix {
	return [
		m[0] * ctm[0] + m[1] * ctm[2],
		m[0] * ctm[1] + m[1] * ctm[3],
		m[2] * ctm[0] + m[3] * ctm[2],
		m[2] * ctm[1] + m[3] * ctm[3],
		m[4] * ctm[0] + m[5] * ctm[2] + ctm[4],
		m[4] * ctm[1] + m[5] * ctm[3] + ctm[5],
	];
}

/** 範囲 (x0, y0, x1, y1) を変換し、変換後の範囲を囲む矩形にする */
function transformBox(box: ArrayLike<number>, m: Matrix): Omit<PdfFillRect, 'fill'> {
	const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = Array.from(box);
	const points = [
		[x0, y0],
		[x0, y1],
		[x1, y0],
		[x1, y1],
	].map(([x = 0, y = 0]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] as const);
	const xs = points.map(([x]) => x);
	const ys = points.map(([, y]) => y);
	return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** 描画命令の一覧から、塗った図形の色と範囲を、描かれた順に取り出す */
function readFills(
	operators: { readonly fnArray: readonly number[]; readonly argsArray: readonly unknown[] },
	OPS: Pdfjs['OPS'],
): PdfFillRect[] {
	const fillOps = new Set<number>([
		OPS.fill,
		OPS.eoFill,
		OPS.fillStroke,
		OPS.eoFillStroke,
		OPS.closeFillStroke,
		OPS.closeEOFillStroke,
	]);
	const fills: PdfFillRect[] = [];
	const stack: { fill: string; matrix: Matrix }[] = [];
	let state = { fill: '#000000', matrix: IDENTITY };
	operators.fnArray.forEach((fn, i) => {
		const args = operators.argsArray[i] as unknown[] | null;
		switch (fn) {
			case OPS.save:
				stack.push(state);
				break;
			case OPS.restore:
				state = stack.pop() ?? state;
				break;
			case OPS.transform:
				state = { ...state, matrix: multiply(args as unknown as Matrix, state.matrix) };
				break;
			case OPS.setFillRGBColor:
				// pdfjs は、灰色や CMYK の塗りも #rrggbb に直して渡す
				state = { ...state, fill: String(args?.[0]) };
				break;
			case OPS.setFillColorN:
				// 模様の塗り。模様の定義が同じなら同じ値になるように、定義のハッシュを使う
				state = {
					...state,
					fill: `pattern:${createHash('sha256').update(JSON.stringify(args)).digest('hex').slice(0, 16)}`,
				};
				break;
			case OPS.constructPath: {
				const [op, , minMax] = args as [number, unknown, ArrayLike<number> | null];
				if (fillOps.has(op) && minMax) {
					fills.push({ fill: state.fill, ...transformBox(minMax, state.matrix) });
				}
				break;
			}
		}
	});
	return fills;
}

export async function extractPdfPages(data: Uint8Array): Promise<ExtractPagesResult> {
	if (data.byteLength === 0) return { kind: 'invalid', reason: 'PDF が空です' };
	if (data.byteLength > MAX_PDF_BYTES) return { kind: 'invalid', reason: 'PDF が大きすぎます' };
	try {
		return await withPdfDocument(data, async (doc, pdfjs): Promise<ExtractPagesResult> => {
			if (doc.numPages < 1 || doc.numPages > MAX_PAGES) {
				return { kind: 'invalid', reason: `ページ数が想定と違います (${doc.numPages} ページ)` };
			}
			const pages: PdfPageContent[] = [];
			for (let number = 1; number <= doc.numPages; number++) {
				const page = await doc.getPage(number);
				const [operators, texts] = await Promise.all([page.getOperatorList(), readTextItems(page)]);
				pages.push({ texts, fills: readFills(operators, pdfjs.OPS) });
			}
			return { kind: 'ok', pages };
		});
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return { kind: 'invalid', reason: `PDF を読めませんでした: ${reason}` };
	}
}

/** PDF のファイルの内容から、学年暦を読む */
export async function parseAcademicCalendarPdf(
	data: Uint8Array,
): Promise<AcademicCalendarPdfResult> {
	const extracted = await extractPdfPages(data);
	if (extracted.kind === 'invalid') return extracted;
	return parseAcademicCalendarPages(extracted.pages);
}
