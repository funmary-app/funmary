// 通知のフィード (RSS、Atom、JSON Feed) に載せる項目。直近 30 日、最大 50 件。
// RSS リーダーが取りに来るだけの口なので、送信の失敗が起きない。Discord やプッシュ通知が不調なときの受け皿にもなる
import { listUserNotifications, TERMS_REQUIRED, type FeedInput, type FeedItem } from '@funmary/api';
import { hasAcceptedTerms } from '@funmary/core';
import {
	DEFAULT_CHANNEL_KINDS,
	type AuthStore,
	type FeedTokenStore,
	type NotificationKind,
	type NotificationStore,
} from '@funmary/db';

/** 載せる期間 */
const DAYS = 30;
/** 載せる件数の上限 */
const MAX_ITEMS = 50;

export interface NotificationFeedSources {
	readonly feedTokens: Pick<FeedTokenStore, 'findOwner' | 'markUsed'>;
	readonly auth: Pick<AuthStore, 'findUserById'>;
	/** 同意を求めている利用規約のバージョン。持ち主が同意するまで、購読は通知を返さない */
	readonly termsVersion: string;
	readonly notifications: Pick<NotificationStore, 'list'>;
	/** 公開 URL の origin。項目のリンクを絶対の URL にするため */
	readonly origin: string;
}

/** フィードに載せられる種類は、Webhook (channel-kind-form.ts) と同じにする */
function isNotificationKind(value: unknown): value is NotificationKind {
	return (DEFAULT_CHANNEL_KINDS as readonly unknown[]).includes(value);
}

/** フィードに載せる種類。既定は Webhook と同じ (休講、補講、教室変更、連携の不具合) */
function kindsOf(options: Record<string, unknown> | null): readonly NotificationKind[] {
	const raw = options?.kinds;
	if (!Array.isArray(raw)) return DEFAULT_CHANNEL_KINDS;
	const kinds = raw.filter(isNotificationKind);
	return kinds.length > 0 ? kinds : DEFAULT_CHANNEL_KINDS;
}

/** トークンの持ち主の通知欄。知らないトークン、取り消したトークン、停止した利用者なら null */
export function loadNotificationFeed(
	sources: NotificationFeedSources,
	token: string,
	now: Date,
): FeedInput | typeof TERMS_REQUIRED | null {
	const owner = sources.feedTokens.findOwner('feed', token);
	if (!owner) return null;
	sources.feedTokens.markUsed(owner.id, now);
	// 利用規約への同意を待っている間は、通知を返さない
	if (
		!hasAcceptedTerms(
			sources.auth.findUserById(owner.userId)?.termsAcceptedVersion ?? null,
			sources.termsVersion,
		)
	) {
		return TERMS_REQUIRED;
	}
	const kinds = kindsOf(owner.options);
	const since = new Date(now.getTime() - DAYS * 24 * 60 * 60 * 1000);
	const items: FeedItem[] = listUserNotifications(sources, owner.userId, {
		kinds,
		since,
		limit: MAX_ITEMS,
	}).map((notification) => ({
		title: notification.title,
		// 項目の ID は通知の ID にする。リンクが変わっても二重に出ないようにするため
		id: `${sources.origin}/app/notifications#ntf-${notification.id}`,
		link: notification.link
			? `${sources.origin}${notification.link}`
			: `${sources.origin}/app/notifications`,
		// JSON Feed は項目に content か description が要る。本文がなければ題を入れる
		description: notification.body ?? notification.title,
		published: notification.createdAt,
	}));
	return {
		options: {
			title: 'Funmary の通知',
			link: `${sources.origin}/app/notifications`,
			description: '休講、補講、教室変更などの通知です。',
			// Atom は feed か各項目に author が要る。利用者の名前は入れない (14.9 の個人情報を載せない決まりと同じ考え方)
			author: { name: 'Funmary' },
			updated: items[0]?.published ?? now,
		},
		items,
	};
}

export interface NotificationFeedLinks {
	readonly rss: string;
	readonly atom: string;
	readonly json: string;
}

/** 設定画面で発行の直後に 1 回だけ出す、フィードの URL */
export function notificationFeedLinks(origin: string, token: string): NotificationFeedLinks {
	const base = `${origin}/feed/${token}`;
	return { rss: `${base}/rss.xml`, atom: `${base}/atom.xml`, json: `${base}/feed.json` };
}
