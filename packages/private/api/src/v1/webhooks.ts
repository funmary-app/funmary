// 利用者の汎用 Webhook に送る JSON の形を、OpenAPI 3.1 の webhooks として書く。
// 送る側は packages/private/notify の genericWebhookBody()。api は notify に依存しない設計なので、形をここに書き写している。
// 形を変えるときは、両方を直す (webhooks.test.ts が、種類の一覧の食い違いを見つける)
import type { openAPIRouteHandler } from 'hono-openapi';

type Documentation = NonNullable<
	NonNullable<Parameters<typeof openAPIRouteHandler>[1]>['documentation']
>;

export const WEBHOOK_EVENT_TYPES = [
	'class.cancelled',
	'class.makeup',
	'class.room_changed',
	'integration.failed',
	'notice',
	'term.started',
] as const;

type Schema = NonNullable<NonNullable<Documentation['components']>['schemas']>[string];

const eventSchema: Schema = {
	type: 'object',
	required: ['id', 'type', 'createdAt', 'data'],
	properties: {
		id: { type: 'string', description: '通知の ID。HTTP ヘッダの webhook-id と同じ' },
		type: { type: 'string', enum: [...WEBHOOK_EVENT_TYPES] },
		createdAt: { type: 'string', format: 'date-time' },
		data: {
			type: 'object',
			required: ['title'],
			properties: {
				title: { type: 'string', description: '人が読む題' },
				body: { type: ['string', 'null'], description: '人が読む本文' },
				url: { type: ['string', 'null'], description: '押したときに開く、絶対の URL' },
				subject: {
					type: 'object',
					description: '休講などの通知のときだけ付く',
					required: ['name', 'url'],
					properties: { name: { type: 'string' }, url: { type: 'string' } },
				},
				date: { type: 'string', description: '日付 (YYYY-MM-DD)。休講などの通知のときだけ付く' },
				period: { type: 'integer', description: '時限。休講などの通知のときだけ付く' },
			},
		},
	},
};

function headerParameter(name: string, description: string) {
	return {
		name,
		in: 'header' as const,
		required: true,
		description,
		schema: { type: 'string' as const },
	};
}

const signatureParameters = [
	headerParameter('webhook-id', '通知の ID。二重に受け取ったかを見分けるのに使う'),
	headerParameter(
		'webhook-timestamp',
		'送った時刻 (UNIX 秒)。古すぎるものは受け取らないようにする',
	),
	headerParameter(
		'webhook-signature',
		'`v1,<base64>` の形。`<webhook-id>.<webhook-timestamp>.<本文>` を、Webhook の署名の鍵 (whsec_...) で HMAC-SHA256 にしたもの。Standard Webhooks (https://www.standardwebhooks.com/) の形式',
	),
];

/** OpenAPI の documentation.webhooks に渡す */
export const openApiWebhooks: NonNullable<Documentation['webhooks']> = {
	notification: {
		post: {
			summary: '通知',
			description:
				'設定画面で登録した汎用の Webhook の URL に、通知のたびに POST する。2xx を返すと受け取り済みになる。410 を返すと、その Webhook への送信を止める。それ以外の失敗は、最大 5 回まで再送する。',
			parameters: signatureParameters,
			requestBody: {
				required: true,
				// webhooks の型は OpenAPI 3.0 の SchemaObject で、3.1 の type: ['string', 'null'] を受け付けない。出力は 3.1 の文書なので、型だけ合わせる
				content: { 'application/json': { schema: eventSchema as never } },
			},
			responses: {
				'200': { description: '受け取った' },
				'410': { description: 'この Webhook はもう使わない。Funmary は送信を止める' },
			},
		},
	},
};
