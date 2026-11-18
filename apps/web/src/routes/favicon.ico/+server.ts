// /favicon.ico。タブのアイコンは <link> で /brand/ の画像を指すが、ファビコンを集めるサービス (MCP のクライアントの一覧など) は、 <link> を読まずに /favicon.ico を探し、なければ親のドメインのものを使う。BRAND_DIR の差し替えにも従う
import { error, type RequestHandler } from '@sveltejs/kit';
import icon192 from '#lib/assets/brand/icon-192.png?inline';
import { decodeDataUrl, loadBrandAsset } from '#lib/server/brand-assets.ts';
import { pngToIco } from '#lib/server/ico.ts';
import { getServices } from '#lib/server/services.ts';

export const GET: RequestHandler = async () => {
	const asset = await loadBrandAsset('icon-192.png', {
		brandDir: getServices().brandDir,
		defaults: { 'icon-192.png': decodeDataUrl(icon192) },
	});
	const ico = asset && pngToIco(asset.body);
	if (!ico) error(404, 'Not Found');
	return new Response(ico, {
		headers: { 'content-type': 'image/x-icon', 'cache-control': 'public, max-age=86400' },
	});
};
