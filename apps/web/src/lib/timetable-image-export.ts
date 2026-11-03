// 週の時間割の表を、画像 (PNG か PDF) にして保存する。重い描画の道具 (modern-screenshot) は、
// 保存を押したときにだけ読み込む (ほかの画面の JavaScript を増やさないため、ここでは import() を使う)

import {
	buildTimetablePdf,
	layoutTimetableImage,
	pdfPageSize,
	timetableImageFileName,
	type TimetableImageFormat,
	type TimetableImageSize,
} from './timetable-image.ts';

export interface TimetableImageRequest {
	/** 週の月曜日 (ファイル名に使う) */
	monday: string;
	/** 出来上がりの大きさ */
	size: TimetableImageSize;
	format: TimetableImageFormat;
	/** 余白に塗る背景色。今のテーマの背景色を、画面側が渡す */
	background: string;
}

async function canvasBlob(
	canvas: HTMLCanvasElement,
	type: string,
	quality?: number,
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('画像のデータを作れませんでした'))),
			type,
			quality,
		);
	});
}

function saveBlob(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = fileName;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	// 押した直後に消すと、ブラウザが保存を始める前に URL が無効になることがあるので、少し待ってから消す
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 表の要素を画像にして、ファイルとして保存する。失敗したら例外を投げる (画面側が知らせる) */
export async function downloadTimetableImage(
	table: HTMLElement,
	request: TimetableImageRequest,
): Promise<void> {
	// 字体 (LINE Seed JP と、補う Noto Sans JP) の読み込みが終わってから描く。
	// 終わる前に描くと、別の字体のまま画像に焼き込まれる
	await document.fonts.ready;
	const { domToCanvas } = await import('modern-screenshot');

	const layout = layoutTimetableImage(request.size, {
		width: table.clientWidth,
		height: table.clientHeight,
	});
	// 置く大きさに足りる解像度で表を描く (最低でも等倍)
	const scale = Math.max(1, layout.drawWidth / table.clientWidth);
	const rendered = await domToCanvas(table, { scale });

	const canvas = document.createElement('canvas');
	canvas.width = layout.width;
	canvas.height = layout.height;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('画像を描く場所を作れませんでした');
	context.fillStyle = request.background;
	context.fillRect(0, 0, layout.width, layout.height);
	context.drawImage(rendered, layout.x, layout.y, layout.drawWidth, layout.drawHeight);

	const fileName = timetableImageFileName(request.monday, request.size.id, request.format);
	if (request.format === 'png') {
		saveBlob(await canvasBlob(canvas, 'image/png'), fileName);
		return;
	}
	const jpeg = new Uint8Array(await (await canvasBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer());
	const pdf = buildTimetablePdf(jpeg, pdfPageSize(request.size), {
		width: canvas.width,
		height: canvas.height,
	});
	saveBlob(new Blob([pdf.buffer as ArrayBuffer], { type: 'application/pdf' }), fileName);
}
