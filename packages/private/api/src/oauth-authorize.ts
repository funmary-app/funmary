// 同意画面 (/oauth/authorize) が受け取る、クライアントからの依頼の検査。
// 画面は SvelteKit 側にあるので、検査だけをここに置き、単体で試せるようにする。
import {
	ACCESS_TOKEN_SCOPES,
	READ_SCOPES,
	type AccessTokenScope,
	type OAuthClient,
} from '@funmary/db';

export interface AuthorizeRequest {
	readonly client: OAuthClient;
	readonly redirectUri: string;
	readonly state: string | null;
	readonly codeChallenge: string;
	/** クライアントが求めた範囲。求めていなければ、すべて */
	readonly requestedScopes: readonly AccessTokenScope[];
}

export type AuthorizeParse =
	| { readonly kind: 'ok'; readonly request: AuthorizeRequest }
	/** client_id かリダイレクト先が信用できない。どこへも戻さず、画面に理由を出す */
	| { readonly kind: 'fatal'; readonly message: string }
	/** リダイレクト先は信用できるが、依頼の中身が正しくない。クライアントへ error を付けて戻す */
	| {
			readonly kind: 'redirect-error';
			readonly redirectUri: string;
			readonly state: string | null;
			readonly error: 'invalid_request' | 'unsupported_response_type';
			readonly description: string;
	  };

/** S256 の code_challenge: SHA-256 (32 バイト) の Base64URL なので、43 文字 */
const S256_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export function parseAuthorizeRequest(
	params: URLSearchParams,
	findClient: (clientId: string) => OAuthClient | null,
): AuthorizeParse {
	const clientId = params.get('client_id');
	const client = clientId ? findClient(clientId) : null;
	if (!client) {
		return {
			kind: 'fatal',
			message: 'このアプリは登録されていません。もう一度、アプリからやり直してください。',
		};
	}
	const redirectUri = params.get('redirect_uri');
	if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
		return { kind: 'fatal', message: '戻り先の URL が、登録されたものと一致しません。' };
	}
	const state = params.get('state');
	const fail = (
		error: 'invalid_request' | 'unsupported_response_type',
		description: string,
	): AuthorizeParse => ({ kind: 'redirect-error', redirectUri, state, error, description });

	if (params.get('response_type') !== 'code') {
		return fail('unsupported_response_type', 'response_type は code にしてください');
	}
	const codeChallenge = params.get('code_challenge') ?? '';
	if (!S256_CHALLENGE.test(codeChallenge) || params.get('code_challenge_method') !== 'S256') {
		return fail('invalid_request', 'PKCE (code_challenge_method=S256) が必要です');
	}
	const asked = (params.get('scope') ?? '').split(/\s+/).filter(Boolean);
	const known = ACCESS_TOKEN_SCOPES.filter((scope) => asked.includes(scope));
	return {
		kind: 'ok',
		request: {
			client,
			redirectUri,
			state,
			codeChallenge,
			requestedScopes: known.length > 0 ? known : READ_SCOPES,
		},
	};
}

/** クライアントへ戻す URL。成功なら code、失敗なら error を付ける。state はそのまま返す */
export function buildRedirect(
	redirectUri: string,
	result: { code: string } | { error: string; description?: string },
	state: string | null,
): string {
	const url = new URL(redirectUri);
	if ('code' in result) url.searchParams.set('code', result.code);
	else {
		url.searchParams.set('error', result.error);
		if (result.description) url.searchParams.set('error_description', result.description);
	}
	if (state !== null) url.searchParams.set('state', state);
	return url.toString();
}
