// 週の時間割を画像 (PNG と PDF) に書き出すときの、大きさと配置の計算と、PDF の組み立て。
// 画面の部品やファイルの保存には触れず、計算だけをする (単体テストで確かめられるようにするため)

export const TIMETABLE_IMAGE_SIZES = [
	{ id: 'wallpaper', label: 'スマホの壁紙', width: 1080, height: 1920 },
	{ id: 'square', label: '正方形', width: 1080, height: 1080 },
	{ id: 'a4', label: 'A4 横', width: 3508, height: 2480 },
] as const;

export type TimetableImageSize = (typeof TIMETABLE_IMAGE_SIZES)[number];
export type TimetableImageSizeId = TimetableImageSize['id'];
export type TimetableImageFormat = 'png' | 'pdf';

export interface PixelSize {
	width: number;
	height: number;
}

/**
 * 出来上がりの画像 (canvas) の中で、時間割をどこに、どの大きさで置くか。
 * 周りに、短い辺の 4% の余白を空け、縦横の比を保ったまま収めて、中央に置く
 */
export function layoutTimetableImage(canvas: PixelSize, image: PixelSize) {
	const padding = Math.round(Math.min(canvas.width, canvas.height) * 0.04);
	const scale = Math.min(
		(canvas.width - padding * 2) / image.width,
		(canvas.height - padding * 2) / image.height,
	);
	const drawWidth = Math.round(image.width * scale);
	const drawHeight = Math.round(image.height * scale);
	return {
		width: canvas.width,
		height: canvas.height,
		x: Math.round((canvas.width - drawWidth) / 2),
		y: Math.round((canvas.height - drawHeight) / 2),
		drawWidth,
		drawHeight,
	};
}

/** 保存するファイルの名前。週の月曜日と、大きさと、形式が分かるようにする */
export function timetableImageFileName(
	monday: string,
	sizeId: TimetableImageSizeId,
	format: TimetableImageFormat,
): string {
	return `funmary-week-${monday}-${sizeId}.${format}`;
}

/** PDF のページの大きさ。画素数を、印刷の基準 (300 dpi) でポイントに換算する (A4 横は 841.92 x 595.2 になる) */
export function pdfPageSize(size: PixelSize): { widthPt: number; heightPt: number } {
	const toPoint = (px: number) => Math.round(((px * 72) / 300) * 100) / 100;
	return { widthPt: toPoint(size.width), heightPt: toPoint(size.height) };
}

/** PDF に書く数値。841.92 や 595.2 のように、小数第 2 位までで末尾の 0 は省く */
function pdfNumber(value: number): string {
	const fixed = value.toFixed(2);
	return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
}

/**
 * JPEG の画像を 1 ページに置いただけの PDF を作る。画像を置く用途には、PDF の生成の依存を
 * 足すほどのことはないので、要る部品 (目次と、ページと、画像) だけをここで組み立てる
 */
export function buildTimetablePdf(
	jpeg: Uint8Array,
	page: { widthPt: number; heightPt: number },
	image: PixelSize,
): Uint8Array {
	const encoder = new TextEncoder();
	const parts: Uint8Array[] = [];
	let length = 0;
	const push = (bytes: Uint8Array) => {
		parts.push(bytes);
		length += bytes.length;
	};
	const pushText = (text: string) => push(encoder.encode(text));

	// 先頭の印と、バイナリを含むことを示すためのコメント行
	pushText('%PDF-1.4\n%');
	push(new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3]));
	pushText('\n');

	const width = pdfNumber(page.widthPt);
	const height = pdfNumber(page.heightPt);
	const content = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`;
	const objects: { text?: string; stream?: Uint8Array }[] = [
		{ text: '<< /Type /Catalog /Pages 2 0 R >>' },
		{ text: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
		{
			text:
				`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
				'/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>',
		},
		{ text: `<< /Length ${encoder.encode(content).length} >>`, stream: encoder.encode(content) },
		{
			text:
				`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
				`/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,
			stream: jpeg,
		},
	];

	const offsets: number[] = [];
	objects.forEach((object, index) => {
		offsets.push(length);
		pushText(`${index + 1} 0 obj\n${object.text}\n`);
		if (object.stream) {
			pushText('stream\n');
			push(object.stream);
			pushText('\nendstream\n');
		}
		pushText('endobj\n');
	});

	const xrefAt = length;
	pushText(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
	for (const offset of offsets) {
		pushText(`${String(offset).padStart(10, '0')} 00000 n \n`);
	}
	pushText(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

	const pdf = new Uint8Array(length);
	let at = 0;
	for (const part of parts) {
		pdf.set(part, at);
		at += part.length;
	}
	return pdf;
}
