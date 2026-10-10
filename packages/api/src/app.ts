// 機械向けの口。SvelteKit のフックから、決まったパスだけがここに渡される。
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createAuthRoutes, type AuthRoutesDeps } from './auth-routes.ts';
import { createCalendarRoutes, type CalendarRoutesDeps } from './calendar-routes.ts';
import { errorResponse } from './error-page.ts';
import { createFeedRoutes, type FeedRoutesDeps } from './feed-routes.ts';
import {
	createDiscordInteractionRoutes,
	type DiscordInteractionsDeps,
} from './discord/interactions.ts';
import { createMcpRoutes, type McpRoutesDeps } from './mcp-routes.ts';
import { createOAuthRoutes, type OAuthRoutesDeps } from './oauth-routes.ts';
import { createOpenApiRoutes } from './v1/openapi.ts';
import { createV1Routes, type V1RoutesDeps } from './v1/routes.ts';

export interface ApiDeps {
	/** 処理の途中で例外が出たときに呼ぶ。画面には内部の情報を出さず、ここで記録する */
	readonly onError?: (error: Error, path: string) => void;
	/** ログインとログアウト。ないときは、その口を開けない */
	readonly auth?: AuthRoutesDeps;
	/** カレンダー購読の ICS。ないときは、その口を開けない */
	readonly calendar?: CalendarRoutesDeps;
	/** 通知のフィード (RSS、Atom、JSON Feed)。ないときは、その口を開けない */
	readonly feed?: FeedRoutesDeps;
	/** 公開 API (/api/v1)。ないときは、その口を開けない */
	readonly v1?: V1RoutesDeps;
	/** MCP サーバー (/mcp)。ないときは、その口を開けない */
	readonly mcp?: McpRoutesDeps;
	/** MCP の認可 (OAuth 2.1)。ないときは、その口を開けない */
	readonly oauth?: OAuthRoutesDeps;
	/** Discord のスラッシュコマンドの受け口。ないときは、その口を開けない */
	readonly discordInteractions?: DiscordInteractionsDeps;
	/** DB に読み書きできるか。例外を投げたときも、読み書きできないとみなす */
	readonly checkHealth: () => boolean;
}

export function createApi(deps: ApiDeps): Hono {
	const app = new Hono();
	app.onError((error, c) => {
		// MCP のトランスポートは、クライアントの誤りを HTTPException で投げる。サーバーの 500 にせず、その応答を返す
		if (error instanceof HTTPException && error.status < 500) return error.getResponse();
		deps.onError?.(error, c.req.path);
		return errorResponse(c, 500);
	});
	app.notFound((c) => errorResponse(c, 404));
	if (deps.auth) app.route('/', createAuthRoutes(deps.auth));
	if (deps.calendar) app.route('/', createCalendarRoutes(deps.calendar));
	if (deps.feed) app.route('/', createFeedRoutes(deps.feed));
	if (deps.v1) {
		const v1 = createV1Routes(deps.v1);
		app.route('/', v1);
		app.route('/', createOpenApiRoutes(v1));
	}
	if (deps.mcp) app.route('/', createMcpRoutes(deps.mcp));
	if (deps.oauth) app.route('/', createOAuthRoutes(deps.oauth));
	if (deps.discordInteractions) {
		app.route('/', createDiscordInteractionRoutes(deps.discordInteractions));
	}

	// 外部の監視サービスが 5 分ごとに見る。中身は "動いているか" だけにし、内部の情報は出さない
	app.get('/healthz', (c) => {
		c.header('Cache-Control', 'no-store');
		let healthy: boolean;
		try {
			healthy = deps.checkHealth();
		} catch {
			healthy = false;
		}
		return healthy ? c.json({ status: 'ok' }) : c.json({ status: 'unavailable' }, 503);
	});

	return app;
}
