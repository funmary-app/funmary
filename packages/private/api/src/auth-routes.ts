// ログインとログアウトの口。Google との通信と DB は @funmary/auth が受け持ち、ここでは、
// Cookie の読み書きと、リダイレクトだけを行う。
import { openFlow, sealFlow, type AuthService, type DenyReason } from '@funmary/auth';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';
import { errorResponse } from './error-page.ts';

export interface AuthRoutesDeps {
	readonly service: AuthService;
	/** セッションを消すために使う */
	readonly deleteSession: (token: string) => void;
	/** ENCRYPTION_KEY を Base64 から戻した、32 バイトの鍵 */
	readonly flowKey: Buffer;
	/** 公開 URL の origin。https なら、Cookie に Secure を付ける。ログアウトの送り元の確認にも使う */
	readonly origin: string;
	/** 新しい利用者が登録したときに呼ぶ。メールアドレスなど、個人情報は渡さない */
	readonly onNewUser?: () => void;
}

/** セッションの Cookie の有効期限 (30 日)。DB の有効期限と同じにする */
export const SESSION_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

const FLOW_COOKIE_MAX_AGE_S = 10 * 60;
const FLOW_PATH = '/auth/google';

const isSecure = (origin: string) => origin.startsWith('https://');

/** https で公開するときは、__Host- を付ける (Secure、Path=/、Domain なしを、ブラウザが強制する) */
export function sessionCookieName(origin: string): string {
	return isSecure(origin) ? '__Host-funmary_session' : 'funmary_session';
}

/** ログインのあとに戻る先 (同意の画面) を覚える Cookie。ログインしていない人が /oauth/authorize を開いたときに使う */
export function returnCookieName(origin: string): string {
	return isSecure(origin) ? '__Host-funmary_return' : 'funmary_return';
}

export const RETURN_COOKIE_MAX_AGE_S = 10 * 60;

/** 戻り先に使ってよいパスか。外のサイトへ飛ばされないよう、同意の画面だけに限る */
const isReturnPath = (value: string | undefined): value is string =>
	value !== undefined && /^\/oauth\/authorize\?[!-~]*$/.test(value);

export function sessionCookieOptions(origin: string): CookieOptions {
	return {
		httpOnly: true,
		sameSite: 'Lax',
		secure: isSecure(origin),
		path: '/',
		maxAge: SESSION_COOKIE_MAX_AGE_S,
	};
}

/** ログインに失敗したときに、画面に渡す理由。画面が文言を決める */
export type LoginErrorCode = DenyReason | 'flow-expired' | 'invalid-callback' | 'invite-unknown';

const loginErrorUrl = (code: LoginErrorCode) => `/login?error=${code}`;

export function createAuthRoutes(deps: AuthRoutesDeps): Hono {
	const app = new Hono();
	const secure = isSecure(deps.origin);
	const flowCookie = secure ? '__Secure-funmary_login' : 'funmary_login';
	const sessionName = sessionCookieName(deps.origin);

	const goToGoogle = async (c: Context, inviteCode: string | null, testAccount = false) => {
		const { redirectTo, flow } = await deps.service.startLogin({ inviteCode, testAccount });
		// Google から戻るときは別のサイトからの移動なので、SameSite は Lax にする (Strict だと Cookie が届かない)
		setCookie(c, flowCookie, sealFlow(flow, deps.flowKey), {
			httpOnly: true,
			sameSite: 'Lax',
			secure,
			path: FLOW_PATH,
			maxAge: FLOW_COOKIE_MAX_AGE_S,
		});
		c.header('Cache-Control', 'no-store');
		return c.redirect(redirectTo, 302);
	};

	app.get('/auth/google', (c) => goToGoogle(c, null));
	// 管理者が用意したテストアカウント (大学のアカウントでない Google のアカウント) の入口。
	// ここから進んでも、テストアカウントでなければ、コールバックで断られる
	app.get('/auth/google/test', (c) => goToGoogle(c, null, true));

	// 招待コードがあるときの入口。Google に進む前に、コードを確かめる
	app.get('/signup', (c) => {
		const code = c.req.query('code')?.trim();
		if (!code) return c.redirect(loginErrorUrl('invite-unknown'), 302);
		const check = deps.service.checkInviteCode(code);
		if (check.kind === 'invalid') {
			return c.redirect(
				loginErrorUrl(check.reason === 'unknown' ? 'invite-unknown' : check.reason),
				302,
			);
		}
		return goToGoogle(c, code);
	});

	app.get('/auth/google/callback', async (c) => {
		c.header('Cache-Control', 'no-store');
		const sealed = getCookie(c, flowCookie);
		// 使い終わった Cookie は、成功しても失敗しても消す
		deleteCookie(c, flowCookie, { path: FLOW_PATH, secure });
		const flow = sealed ? openFlow(sealed, deps.flowKey) : null;
		if (!flow) return c.redirect(loginErrorUrl('flow-expired'), 302);

		const result = await deps.service.completeLogin({ callbackUrl: new URL(c.req.url), flow });
		if (result.kind !== 'signed-in') return c.redirect(loginErrorUrl(result.reason), 302);
		if (result.isNewUser) deps.onNewUser?.();

		setCookie(c, sessionName, result.sessionToken, sessionCookieOptions(deps.origin));
		// 同意の画面から来たときは、そこへ戻す。アプリの画面は /app の下にある (/ は紹介の画面)
		const returnName = returnCookieName(deps.origin);
		const returnTo = getCookie(c, returnName);
		deleteCookie(c, returnName, { path: '/', secure });
		return c.redirect(isReturnPath(returnTo) ? returnTo : '/app', 302);
	});

	app.post('/auth/logout', (c) => {
		// 他のサイトのフォームからの送信を断る。SameSite=Lax でも防げるが、送り元の確認も重ねる
		const origin = c.req.header('Origin');
		if (origin !== undefined && origin !== deps.origin) return errorResponse(c, 403);
		const token = getCookie(c, sessionName);
		if (token) deps.deleteSession(token);
		deleteCookie(c, sessionName, { path: '/', secure });
		return c.redirect('/', 303);
	});

	return app;
}
