// MCP の認可 (OAuth 2.1) の同意画面。claude.ai などのコネクタが、利用者をここへ連れてくる。
// ログインしていなければ、ログインのあとにここへ戻るよう Cookie に覚えさせて、ログインへ送る。
import {
	buildRedirect,
	parseAuthorizeRequest,
	RETURN_COOKIE_MAX_AGE_S,
	returnCookieName,
	type AuthorizeParse,
} from '@funmary/api';
import { fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { ACCESS_TOKEN_SCOPE_OPTIONS } from '#lib/server/access-token-form.ts';
import { getServices } from '#lib/server/services.ts';
import { requireSignedIn } from '#lib/server/admin.ts';

/**
 * クライアントへ戻す。戻り先は、クライアントが登録した URI と完全に一致したものだけ (parseAuthorizeRequest が検査する) なので、外のサイトへの移動を許してよい。
 */
const goBack = (location: string): never => redirect(303, location, { external: true });

type RedirectError = Extract<AuthorizeParse, { kind: 'redirect-error' }>;
const goBackWithError = (parsed: RedirectError): never =>
	goBack(
		buildRedirect(
			parsed.redirectUri,
			{ error: parsed.error, description: parsed.description },
			parsed.state,
		),
	);

export const load: ServerLoad = ({ locals, url, cookies }) => {
	const { oauth, origin } = getServices();
	const parsed = parseAuthorizeRequest(url.searchParams, (id) => oauth.findClient(id));
	if (parsed.kind === 'fatal') return { fatal: parsed.message };
	if (parsed.kind === 'redirect-error') goBackWithError(parsed);
	if (parsed.kind !== 'ok') return { fatal: null };
	if (!locals.user) {
		cookies.set(returnCookieName(origin), `${url.pathname}${url.search}`, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: origin.startsWith('https://'),
			maxAge: RETURN_COOKIE_MAX_AGE_S,
		});
		redirect(303, '/login');
	}
	const { client, redirectUri, requestedScopes } = parsed.request;
	return {
		fatal: null,
		clientName: client.name,
		// 戻り先がどこかを、利用者が見て分かるようにする (似た名前のアプリになりすます対策)
		redirectHost: new URL(redirectUri).host,
		email: locals.user.email,
		scopes: ACCESS_TOKEN_SCOPE_OPTIONS.filter((option) => requestedScopes.includes(option.scope)),
	};
};

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		requireSignedIn(locals);
		const { oauth } = getServices();
		const parsed = parseAuthorizeRequest(url.searchParams, (id) => oauth.findClient(id));
		if (parsed.kind === 'fatal') return fail(400, { error: parsed.message });
		if (parsed.kind === 'redirect-error') return goBackWithError(parsed);
		const { client, redirectUri, state, codeChallenge, requestedScopes } = parsed.request;
		const form = await request.formData();
		if (form.get('decision') !== 'allow') {
			return goBack(buildRedirect(redirectUri, { error: 'access_denied' }, state));
		}
		const chosen = form.getAll('scope');
		const scopes = requestedScopes.filter((scope) => chosen.includes(scope));
		if (scopes.length === 0) {
			return fail(400, { error: '許可する範囲を、1 つ以上選んでください。' });
		}
		const code = oauth.createCode(
			{ clientId: client.id, userId: locals.user.id, redirectUri, codeChallenge, scopes },
			new Date(),
		);
		return goBack(buildRedirect(redirectUri, { code }, state));
	},
};
