import { describe, expect, it } from 'vitest';
import {
	buildTimetablePdf,
	layoutTimetableImage,
	pdfPageSize,
	timetableImageFileName,
} from './timetable-image.ts';

describe('時間割の画像の配置', () => {
	it('横長の時間割を縦長の壁紙に収めると、幅に合わせて上下の中央に置く', () => {
		// 余白は短い辺 (1080) の 4% で 43。内側の幅 994 に時間割 (1600 x 900) を合わせると、高さは 559
		expect(
			layoutTimetableImage({ width: 1080, height: 1920 }, { width: 1600, height: 900 }),
		).toEqual({ width: 1080, height: 1920, x: 43, y: 681, drawWidth: 994, drawHeight: 559 });
	});

	it('縦長の時間割を正方形に収めると、高さに合わせて左右の中央に置く', () => {
		expect(
			layoutTimetableImage({ width: 1080, height: 1080 }, { width: 900, height: 1600 }),
		).toEqual({ width: 1080, height: 1080, x: 261, y: 43, drawWidth: 559, drawHeight: 994 });
	});

	it('A4 横では、余白を短い辺 (高さ) から決める', () => {
		// 余白は 2480 の 4% で 99。内側の幅 3310 に時間割 (2000 x 1000) を合わせると、高さは 1655
		expect(
			layoutTimetableImage({ width: 3508, height: 2480 }, { width: 2000, height: 1000 }),
		).toEqual({ width: 3508, height: 2480, x: 99, y: 413, drawWidth: 3310, drawHeight: 1655 });
	});
});

describe('時間割の画像のファイル名', () => {
	it('週の月曜日と、大きさと、形式が入る', () => {
		expect(timetableImageFileName('2026-11-02', 'wallpaper', 'png')).toBe(
			'funmary-week-2026-11-02-wallpaper.png',
		);
		expect(timetableImageFileName('2026-11-02', 'a4', 'pdf')).toBe(
			'funmary-week-2026-11-02-a4.pdf',
		);
	});
});

describe('PDF のページの大きさ', () => {
	it('A4 横の画素数を 300 dpi で換算すると、A4 の寸法 (297 mm x 210 mm) になる', () => {
		expect(pdfPageSize({ width: 3508, height: 2480 })).toEqual({
			widthPt: 841.92,
			heightPt: 595.2,
		});
	});

	it('壁紙の画素数も、同じ 300 dpi で換算する', () => {
		expect(pdfPageSize({ width: 1080, height: 1920 })).toEqual({ widthPt: 259.2, heightPt: 460.8 });
	});
});

describe('画像だけの PDF', () => {
	// JPEG らしい先頭と末尾を持つ、適当なバイト列。本物の JPEG でなくても、PDF の組み立てには関係ない
	const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
	const pdf = buildTimetablePdf(
		jpeg,
		{ widthPt: 841.92, heightPt: 595.2 },
		{ width: 3508, height: 2480 },
	);
	const text = new TextDecoder('latin1').decode(pdf);

	it('PDF の印を持ち、ページの大きさと画像の画素数が書かれている', () => {
		expect(text.startsWith('%PDF-1.4')).toBe(true);
		expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
		expect(text).toContain('/MediaBox [0 0 841.92 595.2]');
		expect(text).toContain('/Width 3508');
		expect(text).toContain('/Height 2480');
		expect(text).toContain('/Filter /DCTDecode');
	});

	it('画像のバイト列が、そのまま本文に入っている', () => {
		const at = indexOfBytes(pdf, jpeg);
		expect(at).toBeGreaterThan(0);
	});

	it('目次 (xref) の位置が、各部品の先頭を指している', () => {
		const xrefAt = text.lastIndexOf('\nxref\n') + 1;
		const lines = text.slice(xrefAt).split('\n');
		// lines[0] は xref、lines[1] は "0 6" のような範囲の行、lines[2] 以降が各部品の行
		const count = Number(lines[1].split(' ')[1]);
		expect(count).toBe(6);
		for (let n = 1; n < count; n++) {
			const offset = Number(lines[2 + n].slice(0, 10));
			const head = `${n} 0 obj`;
			expect(text.slice(offset, offset + head.length)).toBe(head);
		}
		const startxref = Number(text.match(/startxref\n(\d+)/)?.[1]);
		expect(startxref).toBe(xrefAt);
	});
});

/** バイト列の中から、部分のバイト列の位置を探す。なければ -1 */
function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
	outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
		for (let j = 0; j < needle.length; j++) {
			if (haystack[i + j] !== needle[j]) continue outer;
		}
		return i;
	}
	return -1;
}
