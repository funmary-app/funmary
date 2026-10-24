// 利用者が自分で用意した Webhook への送信。Funmary 共通の JSON の形で送り、
// Standard Webhooks の署名を付ける。SSRF から守るため、送信にはいつも SSRF 対策済みの undici の Agent を使う。
// 失敗の扱いは Discord の Webhook と違う: 410 (使えなくなった) だけを止める理由にし、ほかは最大 5 回まで再送する
import { fetch as undiciFetch } from 'undici';
import { retryAfterMs, type DeliveryMessage, type SendOutcome } from './user-delivery.ts';
import { checkWebhookUrl, createSsrfSafeAgent, SsrfBlockedError } from './ssrf-guard.ts';
import { signWebhook } from './webhook-signature.ts';

const TIMEOUT_MS = 10_000;

/** 通知の種類 (NotificationKind) と、公開する JSON の type の対応 */
const TYPE_NAMES: Readonly<Record<string, string>> = {
	cancellation: 'class.cancelled',
	makeup: 'class.makeup',
	roomChange: 'class.room_changed',
	integration: 'integration.failed',
	notice: 'notice',
	termStart: 'term.started',
};

export interface GenericWebhookMessage extends DeliveryMessage {
	/** 通知の ID。Standard Webhooks の webhook-id にする */
	readonly id: string;
}

/** Funmary 共通の JSON の形にする。data には、人が読む題と本文に加えて、
 * 機械的に読める構造化データ (subject、date、period) を、休講などの通知のときだけ足す */
export function genericWebhookBody(message: GenericWebhookMessage): string {
	return JSON.stringify({
		id: message.id,
		type: TYPE_NAMES[message.kind] ?? message.kind,
		createdAt: message.createdAt.toISOString(),
		data: {
			title: message.title,
			body: message.body,
			url: message.url,
			...(message.subject ? { subject: message.subject } : {}),
			...(message.date ? { date: message.date } : {}),
			...(message.period != null ? { period: message.period } : {}),
		},
	});
}

export interface GenericWebhookOptions {
	/** 差し替え用 (テスト)。省くと、SSRF 対策済みの送信を行う */
	readonly fetch?: (url: string, init?: RequestInit) => Promise<Response>;
}

// 複数の送り先で使い回す、SSRF から守る Agent (undici は Agent をオリジンごとに使い回す設計なので、
// リクエストのたびに作らない)
let sharedDispatcher: ReturnType<typeof createSsrfSafeAgent> | undefined;
function defaultFetch(url: string, init?: RequestInit): Promise<Response> {
	sharedDispatcher ??= createSsrfSafeAgent();
	// undici の fetch は、Node 組み込みの fetch と型の形がわずかに違う (別パッケージの同じ API のため)。
	// 実際に使う項目 (method、headers、body は文字列、signal、redirect) はどちらも同じ形なので、実行時は問題ない
	const requestInit = { ...init, dispatcher: sharedDispatcher } as Parameters<
		typeof undiciFetch
	>[1];
	// undici 独自の Response 型と、DOM の Response 型は、細部 (ヘッダの反復子など) がわずかに違う。実行時は同じ値なので、形を合わせる。
	// ここ (packages/private/notify) の tsc では要らなく見えるが、DOM の型を持つ apps/web から使うと、この変換がないと型検査が通らない
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
	return undiciFetch(url, requestInit) as unknown as Promise<Response>;
}

export async function sendViaGenericWebhook(
	url: string,
	message: GenericWebhookMessage,
	signingKey: string,
	options: GenericWebhookOptions = {},
): Promise<SendOutcome> {
	const check = checkWebhookUrl(url);
	if (!check.ok) return { status: 'rejected', reason: check.reason };

	const body = genericWebhookBody(message);
	const headers = {
		'Content-Type': 'application/json',
		...signWebhook({ id: message.id, timestamp: new Date(), body, signingKey }),
	};
	const doFetch = options.fetch ?? defaultFetch;
	let response: Response;
	try {
		response = await doFetch(url, {
			method: 'POST',
			headers,
			body,
			redirect: 'manual',
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch (error) {
		if (error instanceof SsrfBlockedError) {
			return { status: 'rejected', reason: error.message };
		}
		return { status: 'retry', afterMs: null, reason: '通信できませんでした' };
	}
	if (response.ok) return { status: 'sent' };
	if (response.status === 410) {
		return { status: 'gone', reason: 'Webhook が使えなくなりました (HTTP 410)' };
	}
	if (response.status === 429) {
		return {
			status: 'retry',
			afterMs: await retryAfterMs(response),
			reason: '送りすぎです (HTTP 429)',
		};
	}
	// 410 以外は、再送しても直ることがあるので、最大 5 回まで再送する
	return {
		status: 'retry',
		afterMs: null,
		reason: `受け付けられませんでした (HTTP ${response.status})`,
	};
}
