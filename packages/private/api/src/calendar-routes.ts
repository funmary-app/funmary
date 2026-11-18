// カレンダー購読 URL。カレンダーアプリが /cal/<トークン>.ics を取りに来る。
import { Hono } from 'hono';
import { etag } from 'hono/etag';
import { rateLimiter } from 'hono-rate-limiter';
import { errorResponse, errorResponseFor } from './error-page.ts';
import { buildIcs, type CalendarFeed } from './ics.ts';
import { TERMS_REQUIRED, termsRequiredMessage } from './terms-gate.ts';

/** 発行するトークンの形 (32 バイトの乱数の base64url)。形が違えば DB を引かずに 404 にする */
const TOKEN_FILE = /^([\w-]{43})\.ics$/;

/** 同じトークンで取りに来てよい回数。カレンダーアプリは多くても数分に 1 回なので、十分な余裕がある */
const RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 60 };

export interface CalendarRoutesDeps {
	/** トークンの持ち主の予定。知らないトークン、取り消したトークン、停止した利用者なら null */
	readonly loadFeed: (
		token: string,
	) => { feed: CalendarFeed; stamp: Date } | typeof TERMS_REQUIRED | null;
	/** 同意画面の URL。持ち主が利用規約への同意を待っているとき、購読に返す説明に入れる */
	readonly consentUrl?: string;
	/** 予定の UID の @ の後ろ */
	readonly uidDomain: string;
}

export function createCalendarRoutes(deps: CalendarRoutesDeps): Hono {
	const app = new Hono();
	app.use('/cal/*', async (c, next) => {
		await next();
		c.header('X-Robots-Tag', 'noindex');
	});
	app.use(
		'/cal/:file',
		rateLimiter({
			...RATE_LIMIT,
			standardHeaders: 'draft-7',
			handler: (c) => errorResponseFor(c.req.header('Accept'), 429),
			keyGenerator: (c) => c.req.param('file') ?? '',
		}),
	);
	app.use('/cal/:file', etag());
	app.get('/cal/:file', (c) => {
		const token = TOKEN_FILE.exec(c.req.param('file'))?.[1];
		const loaded = token ? deps.loadFeed(token) : null;
		if (!loaded) return errorResponse(c, 404);
		if (loaded === TERMS_REQUIRED) {
			c.header('Cache-Control', 'no-store');
			return c.text(termsRequiredMessage(deps.consentUrl ?? ''), 403);
		}
		// URL にトークンが入るので、共有のキャッシュには残させない
		c.header('Cache-Control', 'private, max-age=900');
		c.header('Content-Type', 'text/calendar; charset=utf-8');
		return c.body(buildIcs(loaded.feed, { uidDomain: deps.uidDomain, stamp: loaded.stamp }));
	});
	return app;
}
