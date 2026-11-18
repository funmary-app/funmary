// ロゴ、アイコン、OGP の画像 (/brand/<ファイル名>)。ロゴとアイコンはコードのライセンスの対象外 (LICENSE-ASSETS) なので、セルフホストでは BRAND_DIR に同じ名前の自分の画像を置いて差し替えてもらう。置いていない画像は、同梱のものを返す。
// static/ に置くと、本番 (adapter-node) はアプリの処理より前に返してしまい、差し替えられないので、ここで返す
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 返せる画像の名前と、その Content-Type。ここにない名前は返さない (BRAND_DIR のほかのファイルを読ませないため) */
export const BRAND_FILES = {
	'icon.svg': 'image/svg+xml',
	'icon-dark.svg': 'image/svg+xml',
	'icon-192.png': 'image/png',
	'icon-512.png': 'image/png',
	'icon-maskable-512.png': 'image/png',
	'apple-touch-icon.png': 'image/png',
	'og-image.png': 'image/png',
	'logo-light.svg': 'image/svg+xml',
	'logo-dark.svg': 'image/svg+xml',
} as const;

export type BrandFile = keyof typeof BRAND_FILES;

const isBrandFile = (name: string): name is BrandFile => Object.hasOwn(BRAND_FILES, name);

/** Vite が ?inline で作る data URL (Base64 か URL エンコード) を、バイト列に戻す */
export function decodeDataUrl(url: string): Uint8Array<ArrayBuffer> {
	const comma = url.indexOf(',');
	const meta = url.slice(0, comma);
	const data = url.slice(comma + 1);
	return meta.endsWith(';base64')
		? new Uint8Array(Buffer.from(data, 'base64'))
		: new TextEncoder().encode(decodeURIComponent(data));
}

export async function loadBrandAsset(
	name: string,
	options: {
		readonly brandDir: string | null;
		readonly defaults: Partial<Record<BrandFile, Uint8Array<ArrayBuffer>>>;
	},
): Promise<{ body: Uint8Array<ArrayBuffer>; type: string } | null> {
	if (!isBrandFile(name)) return null;
	const type = BRAND_FILES[name];
	if (options.brandDir) {
		try {
			return { body: new Uint8Array(await readFile(join(options.brandDir, name))), type };
		} catch {
			// 置いていない画像は、同梱のものを使う
		}
	}
	const body = options.defaults[name];
	return body ? { body, type } : null;
}
