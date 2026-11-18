// フォームの送信の Origin の検査。SvelteKit の組み込みの検査を切って (svelte.config の trustedOrigins)、同じ検査をここで行う。
// OAuth のクライアントはトークンのエンドポイントに Origin なしでフォームを送ることがある。このエンドポイントは Cookie で認証しないため、SvelteKit の Origin 検査から除外する。

/** Origin がなくても通す口。Cookie を使わず、クライアントのサーバーから直接呼ばれる */
const SERVER_TO_SERVER_PATHS: ReadonlySet<string> = new Set(['/oauth/token']);

/**
 * 公開 API (/api/v1/) と MCP (/mcp) は、Authorization ヘッダの Bearer トークンだけで認証し、Cookie を使わない。
 * ブラウザは、別のサイトから、このヘッダを付けて送れないので、CSRF の心配はない。
 * 本文のない DELETE や POST (curl など) は、Content-Type も Origin もないので、通すために除く
 */
const isTokenAuthPath = (path: string) =>
	path === '/mcp' || path.startsWith('/mcp/') || path.startsWith('/api/v1/');

const MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const FORM_CONTENT_TYPES = [
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain',
];

export function isCsrfForbidden(input: {
	readonly method: string;
	readonly path: string;
	readonly contentType: string | null;
	readonly origin: string | null;
	readonly selfOrigin: string;
}): boolean {
	if (!MUTATING_METHODS.has(input.method)) return false;
	if (SERVER_TO_SERVER_PATHS.has(input.path) || isTokenAuthPath(input.path)) return false;
	const isForm =
		!input.contentType ||
		FORM_CONTENT_TYPES.some((type) => input.contentType?.toLowerCase().startsWith(type));
	return isForm && input.origin !== input.selfOrigin;
}
