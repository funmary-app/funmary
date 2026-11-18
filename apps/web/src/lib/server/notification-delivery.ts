// 利用者への通知を送る定期処理 (deliver-notifications) に渡す、DB と Discord への接続。
// NOTIFY_DRY_RUN のときは、送らずに題だけをログに出して、送れたことにする (手元の開発で、本物の送り先に送らないため)
import type {
	ChannelStore,
	DeliveryStore,
	NotificationStore,
	PendingDelivery,
	SubjectStore,
} from '@funmary/db';
import type { DeliverNotificationsDeps, DeliveryItem, DeliveryOutcome } from '@funmary/jobs';
import type { Logger } from '@funmary/log';
import {
	sendViaBot,
	sendViaGenericWebhook,
	sendViaWebhook,
	type DeliveryMessage,
	type DiscordBot,
} from '@funmary/notify';

export interface NotificationDeliveryOptions {
	readonly channels: ChannelStore;
	readonly deliveries: DeliveryStore;
	readonly notifications: NotificationStore;
	/** 汎用 Webhook の構造化データ (data.subject) に使う、科目の名前を引くため */
	readonly subjects: Pick<SubjectStore, 'findById'>;
	/** Discord 連携の送り先に送る Bot。設定されていなければ null */
	readonly bot: DiscordBot | null;
	/** 通知のリンクを絶対の URL にするための、公開 URL の origin */
	readonly origin: string;
	readonly dryRun: boolean;
	/** 管理者が Discord 連携を有効にしているか。無効の間は、連携の送り先に送らない */
	readonly linkEnabled: () => boolean;
	/** 同意を求めている利用規約のバージョン。持ち主が同意するまで、その人の配信は送らない */
	readonly termsVersion: string;
	readonly log: Logger;
	readonly fetch?: (url: string, init?: RequestInit) => Promise<Response>;
}

export function messageFor(
	delivery: PendingDelivery,
	origin: string,
	subjects: Pick<SubjectStore, 'findById'>,
): DeliveryMessage {
	const { notification } = delivery;
	const subject =
		notification.subjectId !== null ? subjects.findById(notification.subjectId) : null;
	const url = notification.link ? `${origin}${notification.link}` : null;
	return {
		kind: notification.kind,
		title: notification.title,
		body: notification.body,
		url,
		createdAt: notification.createdAt,
		subject: subject && url ? { name: subject.name, url } : null,
		date: notification.date,
		period: notification.period,
	};
}

export function deliverNotificationsDeps(
	options: NotificationDeliveryOptions,
): DeliverNotificationsDeps {
	const { channels, deliveries, notifications, bot, dryRun } = options;
	const log = options.log.withTag('deliver');
	// send は、claim で受け取った配信の詳細 (送り先、通知の中身) を引く
	const pending = new Map<number, PendingDelivery>();

	return {
		prepare(now) {
			if (options.linkEnabled()) channels.syncLinkChannels(now);
			return deliveries.enqueueMissing(now);
		},
		claim(now, limit) {
			pending.clear();
			const linkEnabled = options.linkEnabled();
			return (
				deliveries
					// 利用規約に同意していない利用者の配信は、同意するまで送らず、待たせておく
					.claimDue(now, limit, { termsVersion: options.termsVersion })
					.filter((delivery) => linkEnabled || delivery.channelKind !== 'discordLink')
					.map((delivery): DeliveryItem => {
						pending.set(delivery.id, delivery);
						return {
							id: delivery.id,
							attempts: delivery.attempts,
							channelId: delivery.channelId,
							userId: delivery.userId,
							channelKind: delivery.channelKind,
							hasTarget: delivery.target !== null,
						};
					})
			);
		},
		async send(item): Promise<DeliveryOutcome> {
			const delivery = pending.get(item.id);
			if (!delivery?.target) return { status: 'rejected', reason: '送り先がありません' };
			const message = messageFor(delivery, options.origin, options.subjects);
			if (dryRun) {
				log.info(`(送信を止めています) ${delivery.channelKind}: ${message.title}`);
				return { status: 'sent' };
			}
			if (delivery.target.kind === 'webhook') {
				const fetchOption = options.fetch ? { fetch: options.fetch } : {};
				if (delivery.target.signingKey) {
					return sendViaGenericWebhook(
						delivery.target.url,
						{ ...message, id: `ntf_${delivery.notification.id}` },
						delivery.target.signingKey,
						fetchOption,
					);
				}
				return sendViaWebhook(delivery.target.url, message, fetchOption);
			}
			if (!bot) return { status: 'retry', afterMs: null, reason: 'Bot が設定されていません' };
			// both (スレッドと DM の両方) なら、2 件に送る。片方だけ失敗したら再送し、両方に送り直す
			// (届いた方には重複が届くが、害はない。#163)
			const outcomes = await Promise.all(
				delivery.target.destinations.map((destination) =>
					sendViaBot(bot, destination.channelId, message, destination.mentionUserId ?? undefined),
				),
			);
			if (outcomes.every((outcome) => outcome.status === 'sent')) return { status: 'sent' };
			return (
				outcomes.find((outcome) => outcome.status === 'retry') ??
				outcomes.find((outcome) => outcome.status !== 'sent') ??
				outcomes[0]
			);
		},
		markSent: (id, now) => deliveries.markSent(id, now),
		markRetry: (id, plan) => deliveries.markRetry(id, plan),
		markFailed: (id, now, error) => deliveries.markFailed(id, now, error),
		failureStreak: (channelId) => deliveries.failureStreak(channelId),
		disableChannel: (channelId, reason) => channels.disable(channelId, reason),
		notifyUser: (notice, now) => {
			notifications.insertMany([notice], now);
		},
	};
}

/** Webhook の登録のときと、テスト送信のときに送る文面 */
export function testMessage(origin: string, now: Date): DeliveryMessage {
	return {
		kind: 'notice',
		title: 'テスト通知: Funmary からの通知は、このチャンネルに届きます',
		body: '休講、補講、教室変更などが、ここに届きます。',
		url: origin,
		createdAt: now,
	};
}
