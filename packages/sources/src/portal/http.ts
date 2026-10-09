// 学生ポータル (students.fun.ac.jp) との通信の共通の部品。ログインが要るページ (Pt/CSLecture) と、
// 公開シラバス (Lesson/*) のどちらも、これを通す。
// 守ること: Cookie を引き継ぐ、リダイレクトは自分でたどってポータルのホスト以外へは行かない、
// 応答の大きさに上限を設ける、HTML 以外は捨てる。
import type { ReadableStreamReadResult } from 'node:stream/web';
import { CookieJar } from 'tough-cookie';
import desktopUserAgents from 'top-user-agents/desktop';

export const PORTAL_ORIGIN = 'https://students.fun.ac.jp';

/** 作者の判断で、一般的なブラウザのものに合わせる。人気順のリストの先頭 (最も多いデスクトップのもの) を使う */
const USER_AGENT = desktopUserAgents[0]!;

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export type PortalFetch = (url: string, init?: RequestInit) => Promise<Response>;

export class PortalError extends Error {}

/** 応答の本文を、大きさの上限を守って文字にする。文字コードは Content-Type と meta charset から決める */
export async function readHtml(response: Response): Promise<string> {
	const contentType = response.headers.get('Content-Type') ?? '';
	if (!/^text\/html\b/i.test(contentType)) {
		throw new PortalError('HTML ではない応答が返りました');
	}
	const reader = response.body?.getReader();
	if (!reader) return '';
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const result: ReadableStreamReadResult<Uint8Array> = await reader.read();
		if (result.done) break;
		const value = result.value;
		total += value.byteLength;
		if (total > MAX_BYTES) {
			await reader.cancel();
			throw new PortalError('応答が大きすぎるので、読むのをやめました');
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	const header = /charset=([\w-]+)/i.exec(contentType)?.[1];
	const meta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(
		new TextDecoder('latin1').decode(bytes),
	)?.[1];
	try {
		return new TextDecoder(header ?? meta ?? 'utf-8').decode(bytes);
	} catch {
		return new TextDecoder('utf-8').decode(bytes);
	}
}

export interface PortalSession {
	/** Cookie を引き継ぎながら、リダイレクトを自分でたどる。follow: false なら、最初の応答で止める */
	request(
		url: string,
		init?: { method?: 'GET' | 'POST'; body?: string; follow?: boolean },
	): Promise<Response>;
}

/** 1 回の取得のための、Cookie の入れ物を持った通信 */
export function createPortalSession(fetchFn: PortalFetch): PortalSession {
	const jar = new CookieJar();
	return {
		async request(url, init = {}) {
			let current = url;
			let method = init.method ?? 'GET';
			let body = init.body;
			for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
				if (new URL(current).origin !== PORTAL_ORIGIN) {
					throw new PortalError('ポータル以外のホストへの移動には、従いません');
				}
				const headers = new Headers({ 'User-Agent': USER_AGENT, Accept: 'text/html' });
				const cookie = await jar.getCookieString(current);
				if (cookie) headers.set('Cookie', cookie);
				if (body !== undefined) headers.set('Content-Type', 'application/x-www-form-urlencoded');
				const response = await fetchFn(current, {
					method,
					headers,
					redirect: 'manual',
					signal: AbortSignal.timeout(TIMEOUT_MS),
					...(body !== undefined && { body }),
				});
				for (const setCookie of response.headers.getSetCookie()) {
					await jar.setCookie(setCookie, current, { ignoreError: true });
				}
				const location = response.headers.get('Location');
				if (response.status >= 300 && response.status < 400 && location) {
					// ログインの POST だけは、移動先を取りに行かない (1 回の取得で読むページを増やさない)
					if (init.follow === false) return response;
					current = new URL(location, current).toString();
					// POST への 302 と 303 は、GET でたどる (ブラウザと同じ)
					method = 'GET';
					body = undefined;
					continue;
				}
				return response;
			}
			throw new PortalError('リダイレクトが多すぎます');
		},
	};
}
