// Discord と汎用の Webhook を扱う。汎用 Webhook の署名鍵は再発行できる。
// URL (と署名の鍵) は暗号化して保存し、画面には末尾を伏せて出す。テスト送信は、先に連続で送らないよう、利用者ごとに間をあける
import { fail, type Actions, type ServerLoad } from '@sveltejs/kit';
import { DEFAULT_CHANNEL_KINDS } from '@funmary/db';
import { generateSigningKey, maskWebhookUrl, type SendOutcome } from '@funmary/notify';
import { CHANNEL_KIND_OPTIONS } from '#lib/server/channel-kind-form.ts';
import { getServices } from '#lib/server/services.ts';
import {
	parseWebhookCreate,
	parseWebhookId,
	parseWebhookUpdate,
} from '#lib/server/webhook-form.ts';
import { requireSignedIn } from '#lib/server/admin.ts';

/** テスト送信と登録の間隔 */
const SEND_COOLDOWN_MS = 10 * 1000;
const lastSendAt = new Map<string, number>();

/** 間があいていなければ、待つ秒数を返す。送れるときは時刻を記録して null */
function claimSend(userId: string, now: number): number | null {
	const last = lastSendAt.get(userId);
	if (last !== undefined && now - last < SEND_COOLDOWN_MS) {
		return Math.ceil((SEND_COOLDOWN_MS - (now - last)) / 1000);
	}
	lastSendAt.set(userId, now);
	return null;
}

const waitMessage = (seconds: number) =>
	`続けて送れません。${seconds} 秒たってから、もう一度お試しください。`;

/** テスト送信の結果を、利用者に見せる文にする。送れたときは null */
function failureMessage(outcome: SendOutcome): string | null {
	switch (outcome.status) {
		case 'sent':
			return null;
		case 'gone':
			return 'Webhook が見つかりません。URL が正しいか、削除されていないかを確かめてください。';
		case 'retry':
			return '送り先に送れませんでした。しばらくしてから、もう一度お試しください。';
		case 'rejected':
			return '送り先に受け付けられませんでした。URL を確かめてください。';
	}
}

export const load: ServerLoad = ({ locals }) => {
	requireSignedIn(locals);
	const { channels, webhooks } = getServices();
	const list = channels.listWebhooks(locals.user.id);
	return {
		limit: webhooks.limit(),
		count: list.length,
		kindOptions: CHANNEL_KIND_OPTIONS,
		webhooks: list.map((webhook) => ({
			id: webhook.id,
			kind: webhook.kind,
			label: webhook.label,
			maskedUrl: maskWebhookUrl(webhook.url),
			kinds: [...(webhook.notificationKinds ?? DEFAULT_CHANNEL_KINDS)],
			enabled: webhook.status === 'active',
			disabledReason: webhook.disabledReason,
		})),
	};
};

export const actions: Actions = {
	/** 登録する。テスト通知を送れたものだけを登録する */
	add: async ({ request, locals }) => {
		requireSignedIn(locals);
		const { channels, webhooks } = getServices();
		const parsed = parseWebhookCreate(await request.formData());
		if (!parsed.ok) return fail(400, { error: parsed.error });
		const registered = channels.listWebhooks(locals.user.id);
		if (registered.length >= webhooks.limit()) {
			return fail(400, {
				error: `登録できる Webhook は ${webhooks.limit()} 個までです。使わないものを削除してください。`,
			});
		}
		if (registered.some((webhook) => webhook.url === parsed.url)) {
			return fail(400, { error: '同じ Webhook を、すでに登録しています。' });
		}
		const wait = claimSend(locals.user.id, Date.now());
		if (wait !== null) return fail(429, { error: waitMessage(wait) });
		// 汎用の Webhook は、登録の前に署名の鍵を作り、テスト送信にもその鍵を使う
		const signingKey = parsed.kind === 'generic' ? generateSigningKey() : null;
		const problem = failureMessage(await webhooks.sendTest({ url: parsed.url, signingKey }));
		if (problem) return fail(400, { error: problem });
		channels.addWebhook(
			locals.user.id,
			{
				kind: parsed.kind,
				url: parsed.url,
				...(signingKey && { signingKey }),
				label: parsed.label,
				notificationKinds: parsed.kinds,
			},
			new Date(),
		);
		return {
			message: `Webhook を登録しました。テスト通知が、${parsed.kind === 'discord' ? 'Discord のチャンネル' : '送り先'}に届いているか確かめてください。`,
			...(signingKey && { signingKey }),
		};
	},
	/** 名前と、送る通知の種類を保存する */
	update: async ({ request, locals }) => {
		requireSignedIn(locals);
		const form = await request.formData();
		const id = parseWebhookId(form);
		const parsed = parseWebhookUpdate(form);
		if (id === null || !parsed.ok) {
			return fail(400, { error: parsed.ok ? '入力が正しくありません。' : parsed.error });
		}
		const updated = getServices().channels.updateWebhook(locals.user.id, id, {
			label: parsed.label,
			notificationKinds: parsed.kinds,
		});
		if (!updated) return fail(404, { error: 'その Webhook は見つかりません。' });
		return { message: '保存しました。' };
	},
	/** 有効と無効を切り替える。止められていたものを有効に戻すと、止めた理由を消す */
	toggle: async ({ request, locals }) => {
		requireSignedIn(locals);
		const form = await request.formData();
		const id = parseWebhookId(form);
		if (id === null) return fail(400, { error: '入力が正しくありません。' });
		const { channels } = getServices();
		const current = channels.findWebhook(locals.user.id, id);
		if (!current) return fail(404, { error: 'その Webhook は見つかりません。' });
		const enable = current.status !== 'active';
		channels.updateWebhook(locals.user.id, id, { enabled: enable });
		return { message: enable ? '有効にしました。' : '無効にしました。' };
	},
	test: async ({ request, locals }) => {
		requireSignedIn(locals);
		const id = parseWebhookId(await request.formData());
		if (id === null) return fail(400, { error: '入力が正しくありません。' });
		const { channels, webhooks } = getServices();
		const current = channels.findWebhook(locals.user.id, id);
		if (!current) return fail(404, { error: 'その Webhook は見つかりません。' });
		const wait = claimSend(locals.user.id, Date.now());
		if (wait !== null) return fail(429, { error: waitMessage(wait) });
		const problem = failureMessage(
			await webhooks.sendTest({ url: current.url, signingKey: current.signingKey }),
		);
		if (problem) return fail(400, { error: problem });
		return { message: 'テスト通知を送りました。送り先を確かめてください。' };
	},
	/** 汎用の Webhook の署名の鍵を作り直す。古い鍵はもう使えなくなる */
	regenerateKey: async ({ request, locals }) => {
		requireSignedIn(locals);
		const id = parseWebhookId(await request.formData());
		if (id === null) return fail(400, { error: '入力が正しくありません。' });
		const { channels } = getServices();
		const current = channels.findWebhook(locals.user.id, id);
		if (!current || current.kind !== 'generic') {
			return fail(404, { error: 'その Webhook は見つかりません。' });
		}
		const signingKey = generateSigningKey();
		channels.updateWebhook(locals.user.id, id, { signingKey });
		return {
			id,
			message: '署名の鍵を作り直しました。送り先の設定も、新しい鍵に直してください。',
			signingKey,
		};
	},
	remove: async ({ request, locals }) => {
		requireSignedIn(locals);
		const id = parseWebhookId(await request.formData());
		if (id === null) return fail(400, { error: '入力が正しくありません。' });
		if (!getServices().channels.removeWebhook(locals.user.id, id)) {
			return fail(404, { error: 'その Webhook は見つかりません。' });
		}
		return { message: '削除しました。' };
	},
};
