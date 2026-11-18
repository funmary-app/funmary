// 汎用の Webhook に、Funmary からの送信だと確かめられる署名を付ける。
// 形式は Standard Webhooks (https://www.standardwebhooks.com/) に合わせる。鍵は Webhook ごとに作り、登録した直後に 1 回だけ見せて、保存は暗号化する (保存は呼び出し側の @funmary/db が行う)
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** 鍵の実体のバイト数。Standard Webhooks の実装 (公式ライブラリ) と同じ "whsec_" + base64 の形にする */
const KEY_BYTES = 32;
const PREFIX = 'whsec_';

/** 署名の鍵を新しく作る。再発行は、これをもう一度呼ぶだけでよい */
export function generateSigningKey(): string {
	return `${PREFIX}${randomBytes(KEY_BYTES).toString('base64')}`;
}

function decodeSigningKey(key: string): Buffer {
	const base64 = key.startsWith(PREFIX) ? key.slice(PREFIX.length) : key;
	return Buffer.from(base64, 'base64');
}

export interface WebhookHeaders {
	readonly 'webhook-id': string;
	readonly 'webhook-timestamp': string;
	readonly 'webhook-signature': string;
}

export interface SignWebhookOptions {
	/** 通知の ID (webhook-id)。二重に受け取ったかを、受け取る側が見分けるのに使う */
	readonly id: string;
	readonly timestamp: Date;
	/** 送る本文そのもの (JSON.stringify したあとの文字列) */
	readonly body: string;
	readonly signingKey: string;
}

/** Standard Webhooks の 3 つのヘッダを作る */
export function signWebhook(options: SignWebhookOptions): WebhookHeaders {
	const timestampSeconds = Math.floor(options.timestamp.getTime() / 1000);
	const signedContent = `${options.id}.${timestampSeconds}.${options.body}`;
	const signature = createHmac('sha256', decodeSigningKey(options.signingKey))
		.update(signedContent, 'utf8')
		.digest('base64');
	return {
		'webhook-id': options.id,
		'webhook-timestamp': String(timestampSeconds),
		'webhook-signature': `v1,${signature}`,
	};
}

function timingSafeEqualString(a: string, b: string): boolean {
	const bufferA = Buffer.from(a);
	const bufferB = Buffer.from(b);
	return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

/**
 * 受け取った署名が正しいかを確かめる。Funmary 自身は送るだけで使わないが、受け取る側の実装の例と、このファイルのテスト (公式の Standard Webhooks のライブラリとの相互の確認) に使う
 */
export function verifyWebhookSignature(
	options: Omit<SignWebhookOptions, 'timestamp'> & { readonly timestampSeconds: number },
	signatureHeader: string,
): boolean {
	const expected = signWebhook({
		id: options.id,
		timestamp: new Date(options.timestampSeconds * 1000),
		body: options.body,
		signingKey: options.signingKey,
	})['webhook-signature'];
	// 複数の署名がスペース区切りで並ぶことがある (鍵の更新中など)。Funmary は今のところ 1 つしか出さない
	return signatureHeader.split(' ').some((candidate) => timingSafeEqualString(candidate, expected));
}
