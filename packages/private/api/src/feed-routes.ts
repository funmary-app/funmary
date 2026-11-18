// 通知のフィード。RSS リーダーなどが /feed/<トークン>/rss.xml を取りに来る。
// 書式、XML のエスケープ、ETag と 304、HEAD への応答は hono-feed の serveFeed() に任せる
import { Hono, type Context } from 'hono';
import { rateLimiter } from 'hono-rate-limiter';
import { serveFeed, type FeedFormat, type FeedInput } from 'hono-feed';
import { errorResponse, errorResponseFor } from './error-page.ts';
import { TERMS_REQUIRED, termsRequiredMessage } from './terms-gate.ts';

/** 発行するトークンの形 (32 バイトの乱数の base64url)。形が違えば DB を引かずに 404 にする */
const TOKEN = /^[\w-]{43}$/;

/** 同じトークンで取りに来てよい回数。RSS リーダーは多くても数分に 1 回なので、十分な余裕がある */
const RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 60 };

export interface FeedRoutesDeps {
	/** トークンの持ち主の通知欄。知らないトークン、取り消したトークン、停止した利用者なら null */
	readonly loadFeed: (token: string) => FeedInput | typeof TERMS_REQUIRED | null;
	/** 同意画面の URL。持ち主が利用規約への同意を待っているとき、購読に返す説明に入れる */
	readonly consentUrl?: string;
}

export function createFeedRoutes(deps: FeedRoutesDeps): Hono {
	const app = new Hono();
	app.use('/feed/*', async (c, next) => {
		await next();
		c.header('X-Robots-Tag', 'noindex');
	});
	app.use(
		'/feed/:token/*',
		rateLimiter({
			...RATE_LIMIT,
			standardHeaders: 'draft-7',
			handler: (c) => errorResponseFor(c.req.header('Accept'), 429),
			keyGenerator: (c) => c.req.param('token') ?? '',
		}),
	);
	const serveAs = (format: FeedFormat) => (c: Context) => {
		const token = c.req.param('token') ?? '';
		const feed = TOKEN.test(token) ? deps.loadFeed(token) : null;
		if (!feed) return errorResponse(c, 404);
		if (feed === TERMS_REQUIRED) {
			c.header('Cache-Control', 'no-store');
			return c.text(termsRequiredMessage(deps.consentUrl ?? ''), 403);
		}
		// URL にトークンが入るので、共有のキャッシュには残させない (ICS の購読と同じ扱い)
		return serveFeed(c, feed, { format, cacheControl: { private: true, maxAge: 900 } });
	};
	app.get('/feed/:token/rss.xml', serveAs('rss'));
	app.get('/feed/:token/atom.xml', serveAs('atom'));
	app.get('/feed/:token/feed.json', serveAs('json'));
	return app;
}
