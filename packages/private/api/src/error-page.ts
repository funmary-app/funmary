// Hono の口のエラーの画面。ブラウザから開かれたときだけ、画面のエラー (apps/web の +error.svelte) と同じく、状態の番号の猫 (http.cat) を出す。カレンダーアプリなどには、今までどおり文字だけを返す。
// 見た目は apps/web/src/error.html とそろえる
import type { Context } from 'hono';

const TEXT: Record<number, string> = {
	403: 'Forbidden',
	404: 'Not Found',
	429: 'Too Many Requests',
	500: 'Internal Server Error',
};

function title(status: number): string {
	if (status === 404) return 'ページが見つかりません';
	if (status === 403) return 'このページは表示できません';
	if (status === 429) return 'アクセスが多すぎます';
	if (status >= 500) return 'サーバーでエラーが起きました';
	return 'エラーが起きました';
}

/** 状態の番号は整数だけを埋め込むので、外から来た文字は入らない */
export function errorPageHtml(status: number): string {
	const code = Math.trunc(status);
	const heading = title(code);
	const retry =
		code >= 500 || code === 429 ? '<p>しばらくしてから、もう一度お試しください。</p>' : '';
	return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${code} ${heading} - Funmary</title>
<style>
/* 色は apps/web のテーマ (--fm-text、--fm-text-muted、--fm-background、--fm-primary) と同じ値 */
:root { color-scheme: light dark; --text: #333333; --muted: #666666; --bg: #ffffff; --link: #9d2126; }
@media (prefers-color-scheme: dark) { :root { --text: #e6e1e1; --muted: #b3abab; --bg: #141212; --link: #d6999e; } }
body { margin: 0; background: var(--bg); color: var(--text); font-family: system-ui, sans-serif; line-height: 1.7; }
main { max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
.status { margin: 0; color: var(--muted); font-size: 2.5rem; font-weight: 700; line-height: 1; }
h1 { margin: 0.5rem 0 1rem; font-size: 1.5rem; }
a { color: var(--link); }
img { display: block; max-width: 100%; height: auto; border-radius: 0.5rem; }
figure { margin: 2rem 0 0; }
figcaption { color: var(--muted); font-size: 0.8125rem; }
</style>
</head>
<body>
<main>
<p class="status">${code}</p>
<h1>${heading}</h1>
${retry}
<p><a href="/">トップページへ戻る</a></p>
<figure>
<img src="https://http.cat/${code}.jpg" alt="HTTP ${code} を表す猫の写真" width="750" height="600" referrerpolicy="no-referrer" onerror="this.parentElement.remove()">
<figcaption>猫の写真: <a href="https://http.cat/" target="_blank" rel="noopener noreferrer">http.cat</a></figcaption>
</figure>
</main>
</body>
</html>
`;
}

type ErrorStatus = 403 | 404 | 429 | 500;

/** ブラウザ (Accept に text/html がある) には猫の付いた画面を、ほかには文字だけを返す */
export function errorResponseFor(accept: string | undefined, status: ErrorStatus): Response {
	return accept?.includes('text/html')
		? new Response(errorPageHtml(status), {
				status,
				headers: { 'Content-Type': 'text/html; charset=utf-8' },
			})
		: new Response(TEXT[status] ?? 'Error', {
				status,
				headers: { 'Content-Type': 'text/plain; charset=utf-8' },
			});
}

export function errorResponse(c: Context, status: ErrorStatus): Response {
	return errorResponseFor(c.req.header('Accept'), status);
}
