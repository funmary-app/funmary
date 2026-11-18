// スラッシュコマンドの応答は利用者ごとの情報を含むため、実行した本人にだけ表示する。
import { createPublicKey, verify } from 'node:crypto';

/** 古いリクエストの再送を防ぐ、タイムスタンプの許容範囲 (秒) */
const TIMESTAMP_TOLERANCE_S = 5 * 60;
/** Ed25519 の公開鍵を、DER の SubjectPublicKeyInfo にする前置き */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export const INTERACTION_PING = 1;
const RESPONSE_PONG = 1;
const RESPONSE_CHANNEL_MESSAGE = 4;
/** ephemeral: 呼んだ本人にだけ見える */
export const FLAG_EPHEMERAL = 64;

export interface VerifyDiscordRequestInput {
	/** Discord の開発者ポータルの公開鍵 (16 進数) */
	readonly publicKeyHex: string;
	readonly signatureHex: string | undefined;
	readonly timestamp: string | undefined;
	/** 受け取った本文そのもの (JSON にする前の文字列) */
	readonly body: string;
	readonly now: Date;
}

/** Discord から来たリクエストか。署名が合わない、時刻が大きくずれている、形が違うなら false */
export function verifyDiscordRequest(input: VerifyDiscordRequestInput): boolean {
	const { signatureHex, timestamp } = input;
	if (!signatureHex || !timestamp || !/^[0-9a-f]{128}$/i.test(signatureHex)) return false;
	const issuedAt = Number(timestamp);
	if (!Number.isInteger(issuedAt)) return false;
	if (Math.abs(input.now.getTime() / 1000 - issuedAt) > TIMESTAMP_TOLERANCE_S) return false;
	const key = createPublicKey({
		key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(input.publicKeyHex, 'hex')]),
		format: 'der',
		type: 'spki',
	});
	return verify(
		null,
		Buffer.from(timestamp + input.body, 'utf8'),
		key,
		Buffer.from(signatureHex, 'hex'),
	);
}

/** Discord の PING に返す、PONG */
export const pongResponse = () => ({ type: RESPONSE_PONG });

/** 本人にだけ見せる、文字だけの応答 */
export const ephemeralMessage = (content: string) => ({
	type: RESPONSE_CHANNEL_MESSAGE,
	data: { content, flags: FLAG_EPHEMERAL },
});

/** 送られてきたインタラクションから、呼ばれたコマンド名と、呼んだ人の Discord の ID を取り出す */
export function invocationOf(interaction: unknown): { command: string; userId: string } | null {
	if (!interaction || typeof interaction !== 'object') return null;
	const { data, user, member } = interaction as {
		data?: { name?: unknown };
		user?: { id?: unknown };
		member?: { user?: { id?: unknown } };
	};
	const command = typeof data?.name === 'string' ? data.name : null;
	const userId = user?.id ?? member?.user?.id;
	if (!command || typeof userId !== 'string') return null;
	return { command, userId };
}
