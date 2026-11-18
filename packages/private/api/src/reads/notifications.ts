// 利用者の通知欄の一覧。画面の通知欄、通知のフィード (RSS など)、公開 API と MCP の list_notifications が、この関数を通して同じ通知を読む。
import type { NotificationKind, NotificationStore, StoredNotification } from '@funmary/db';

/** 絞る前に読む件数の既定値。利用者 1 人の通知は多くないので、これで十分足りる */
const DEFAULT_FETCH_LIMIT = 200;

export interface NotificationsSources {
	readonly notifications: Pick<NotificationStore, 'list'>;
}

export interface ListNotificationsOptions {
	/** 複数の種類で絞る。省けばすべての種類 */
	readonly kinds?: readonly NotificationKind[];
	/** この日時より新しいものだけ */
	readonly since?: Date;
	/** この ID より新しい (ID が大きい) ものだけ。前回読んだ最大の ID を渡すと、差分だけを読める */
	readonly afterId?: number;
	/** 返す最大件数 (絞り込みのあと) */
	readonly limit?: number;
}

/** 新しい順。kinds と since で絞り込んでから limit 件に切る */
export function listUserNotifications(
	sources: NotificationsSources,
	userId: string,
	options: ListNotificationsOptions = {},
): readonly StoredNotification[] {
	const rows = sources.notifications.list(userId, { limit: DEFAULT_FETCH_LIMIT });
	const filtered = rows.filter(
		(notification) =>
			(!options.kinds || options.kinds.includes(notification.kind)) &&
			(!options.since || notification.createdAt >= options.since) &&
			(options.afterId === undefined || notification.id > options.afterId),
	);
	return options.limit === undefined ? filtered : filtered.slice(0, options.limit);
}
