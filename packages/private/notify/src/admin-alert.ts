// 管理用の通知。Funmary 自体の状態 (取得元の不調、件数の急な減少、予期しないエラーなど) を、運用する人に Discord の Webhook で知らせる。利用者への通知 (通知欄、チャネル) とは分け、送り先の型も共有しない。
//
// - ログに warn 以上で残したうえで、その場で送る。通知欄にも送信待ちにも入れない
// - 秘密の値は、ログと同じ伏せる処理を通してから送る
// - 同じ内容は 1 時間に 1 回までにまとめる
// - 送信が失敗しても再送は 1 回だけにして、あとはログに残して終える (通知の失敗を知らせようとして、失敗が続くのを防ぐ)
// - Webhook が空か、Discord の Webhook の URL でなければ、ログにだけ残す。dry-run のときも送らない
import { redact, type Logger } from '@funmary/log';
import { defaultChannel, type AdminDiscordSink } from './admin-discord.ts';
import type { AdminChannel } from './discord-layout.ts';

export type AdminAlertSeverity = 'info' | 'warn' | 'error';

export interface AdminAlert {
	readonly severity: AdminAlertSeverity;
	readonly title: string;
	readonly message?: string;
	/** 同じ内容かどうかの判定に使う。省くと題を使う */
	readonly key?: string;
	/** Bot で送るときのチャンネル。省くと、error は errors、それ以外は sources */
	readonly category?: AdminChannel;
}

export type AdminAlertResult = 'sent' | 'logged' | 'suppressed' | 'failed';

export interface AdminAlerter {
	send(alert: AdminAlert): Promise<AdminAlertResult>;
}

export interface AdminAlerterOptions {
	/** ADMIN_DISCORD_WEBHOOK_URL。Bot がないときの送り先。空ならログにだけ残す */
	readonly webhookUrl: string | undefined;
	/** Bot での送り先。あれば Webhook より先に使う */
	readonly discord?: AdminDiscordSink;
	/** NOTIFY_DRY_RUN。true なら送らず、ログに出す */
	readonly dryRun: boolean;
	readonly fetch?: (url: string, init?: RequestInit) => Promise<Response>;
	readonly log: Logger;
	readonly now?: () => Date;
}

/** Webhook として受け付ける URL。ここ以外への送信を許さない (環境変数の書き間違いで、別の場所に送らないため) */
const WEBHOOK_PATTERN = /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/;
const DEDUPE_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 15_000;
/** Discord の 1 通の上限は 2000 文字 */
const MAX_CONTENT = 1900;

export function createAdminAlerter(options: AdminAlerterOptions): AdminAlerter {
	const log = options.log.withTag('admin-alert');
	const now = options.now ?? (() => new Date());
	const doFetch = options.fetch ?? fetch;
	const webhookUrl =
		options.webhookUrl && WEBHOOK_PATTERN.test(options.webhookUrl) ? options.webhookUrl : undefined;
	if (options.webhookUrl && !webhookUrl) {
		log.warn(
			'ADMIN_DISCORD_WEBHOOK_URL が Discord の Webhook の URL ではないので、ログにだけ残します',
		);
	}
	const lastSent = new Map<string, number>();

	async function post(content: string): Promise<boolean> {
		try {
			const response = await doFetch(webhookUrl!, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				// メンションを効かせない。本文に @everyone を混ぜられても、通知が飛ばないようにする
				body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
			return response.ok;
		} catch {
			return false;
		}
	}

	return {
		async send(alert) {
			const key = alert.key ?? alert.title;
			const at = now().getTime();
			const previous = lastSent.get(key);
			if (previous !== undefined && at - previous < DEDUPE_MS) {
				log.debug(`同じ内容なので送りません: ${alert.title}`);
				return 'suppressed';
			}
			lastSent.set(key, at);

			const text = alert.message ? `${alert.title}\n${alert.message}` : alert.title;
			log[alert.severity](text);
			if ((!webhookUrl && !options.discord) || options.dryRun) return 'logged';

			const content = redact(
				`**${alert.title}**${alert.message ? `\n${alert.message}` : ''}`,
			).slice(0, MAX_CONTENT);
			const { discord } = options;
			const send = discord
				? () =>
						discord.post(alert.category ?? defaultChannel(alert.severity), alert.severity, content)
				: () => post(content);
			// 1 回目が失敗したら、1 回だけ再送する
			if ((await send()) || (await send())) return 'sent';
			log.error(`管理用の通知を Discord に送れませんでした: ${alert.title}`);
			return 'failed';
		},
	};
}
