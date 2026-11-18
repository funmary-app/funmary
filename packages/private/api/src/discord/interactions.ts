// Discord の署名を検証し、コマンドへの応答は呼び出し側が指定した関数で生成する。
import {
	ephemeralMessage,
	invocationOf,
	pongResponse,
	INTERACTION_PING,
	verifyDiscordRequest,
} from './interactions-protocol.ts';
import { Hono } from 'hono';

export interface DiscordInteractionsDeps {
	/** Discord の開発者ポータルの公開鍵 (16 進数) */
	readonly publicKeyHex: string;
	/**
	 * コマンドの答え (本人にだけ見せる本文)。呼んだ人の Discord の ID から、連携の確認と本文の作成までを行う。
	 * 例外を投げたら、ここで握って案内の文を返すこと
	 */
	readonly answer: (command: string, discordUserId: string, now: Date) => string;
}

export function createDiscordInteractionRoutes(deps: DiscordInteractionsDeps): Hono {
	const app = new Hono();
	app.post('/discord/interactions', async (c) => {
		const body = await c.req.text();
		const verified = verifyDiscordRequest({
			publicKeyHex: deps.publicKeyHex,
			signatureHex: c.req.header('X-Signature-Ed25519'),
			timestamp: c.req.header('X-Signature-Timestamp'),
			body,
			now: new Date(),
		});
		if (!verified) return c.body(null, 401);

		let interaction: unknown;
		try {
			interaction = JSON.parse(body);
		} catch {
			return c.body(null, 400);
		}
		if ((interaction as { type?: unknown }).type === INTERACTION_PING) {
			return c.json(pongResponse());
		}
		const invocation = invocationOf(interaction);
		if (!invocation) return c.body(null, 400);
		const content = deps.answer(invocation.command, invocation.userId, new Date());
		return c.json(ephemeralMessage(content));
	});
	return app;
}
