// /api/v1/openapi.json と /api/docs。describeRoute() で付けた定義から、OpenAPI 3.1 の文書と Swagger UI を作る。利用者のデータは載せないので、ログインなしで開ける。
import { swaggerUI } from '@hono/swagger-ui';
import { Hono } from 'hono';
import { openAPIRouteHandler } from 'hono-openapi';
import type { V1AuthVariables } from './auth.ts';
import { openApiWebhooks } from './webhooks.ts';

export function createOpenApiRoutes(v1: Hono<{ Variables: V1AuthVariables }>): Hono {
	const app = new Hono();
	app.get(
		'/api/v1/openapi.json',
		openAPIRouteHandler(v1, {
			documentation: {
				info: {
					title: 'Funmary 公開 API',
					version: '1',
					description:
						'授業、休講、通知欄、バスの時刻表を提供する API (範囲を許したトークンでは、予定、履修、通知の書き込みもできる)。設定画面で発行した個人用のアクセストークンを Authorization: Bearer <トークン> で送ってください。トークンの持ち主が、いまの版の利用規約とプライバシーポリシーに同意するまでは、どの口も 403 を返します (error は terms_not_accepted で、consentUrl に同意画面の URL が入ります)。',
				},
				servers: [],
				components: {
					securitySchemes: {
						bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'fmy_*' },
					},
				},
				security: [{ bearerAuth: [] }],
				webhooks: openApiWebhooks,
			},
		}),
	);
	app.get('/api/docs', swaggerUI({ url: '/api/v1/openapi.json' }));
	return app;
}
