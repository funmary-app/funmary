// カレンダー購読の設定画面で出す URL と QR コード。
import { encode } from 'uqr';

/** QR コードの周りの余白のマス数 (規格の推奨は 4) */
const QUIET_ZONE = 4;

export interface SubscriptionLinks {
	/** 購読 URL。カレンダーアプリの "URL で追加" に貼る */
	readonly url: string;
	/** iPhone や Mac で、押すとカレンダーアプリが開く URL */
	readonly webcal: string;
	/** Google カレンダーの、購読を追加する画面の URL */
	readonly google: string;
}

export function subscriptionLinks(origin: string, token: string): SubscriptionLinks {
	const url = `${origin}/cal/${token}.ics`;
	const webcal = url.replace(/^https?:/, 'webcal:');
	return {
		url,
		webcal,
		google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
	};
}

/** QR コードの暗いマスを、1 マスを 1 単位とする SVG の path にする。{@html} を使わずに描けるようにする */
export function qrCode(text: string): { size: number; path: string } {
	const { data, size } = encode(text, { border: QUIET_ZONE });
	let path = '';
	for (const [y, row] of data.entries()) {
		for (const [x, dark] of row.entries()) {
			if (dark) path += `M${x} ${y}h1v1h-1z`;
		}
	}
	return { size, path };
}
