// 通知欄。種類で絞り込み、開くと既読にして該当の画面へ移る。まとめて既読にもできる
import { fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { jstDateTime } from '@funmary/core';
import type { NotificationKind } from '@funmary/db';
import { getServices } from '#lib/server/services.ts';
import { requireSignedIn } from '#lib/server/admin.ts';

/** 一覧に出す件数。90 日より古い通知は定期処理が消す */
const LIMIT = 200;

const KINDS: readonly NotificationKind[] = [
	'cancellation',
	'makeup',
	'roomChange',
	'integration',
	'notice',
	'termStart',
];

const isKind = (value: string | null): value is NotificationKind =>
	value !== null && (KINDS as readonly string[]).includes(value);

/** 開いたときに移る先は、アプリの中のパスだけにする (外のサイトへは移さない) */
const safeLink = (link: string | null) =>
	link !== null && link.startsWith('/') && !link.startsWith('//') ? link : null;

export const load: ServerLoad = ({ locals, url }) => {
	requireSignedIn(locals);
	const kindParam = url.searchParams.get('kind');
	const kind = isKind(kindParam) ? kindParam : null;
	const { notifications } = getServices();
	return {
		kind,
		notifications: notifications
			.list(locals.user.id, { limit: LIMIT, ...(kind && { kind }) })
			.map((item) => {
				const { date, time } = jstDateTime(item.createdAt);
				return {
					id: item.id,
					kind: item.kind,
					title: item.title,
					body: item.body,
					hasLink: safeLink(item.link) !== null,
					createdAt: `${date} ${time}`,
					read: item.readAt !== null,
				};
			}),
	};
};

export const actions: Actions = {
	open: async ({ request, locals }) => {
		requireSignedIn(locals);
		const id = Number((await request.formData()).get('id'));
		const notification = Number.isInteger(id)
			? getServices().notifications.markRead(locals.user.id, id, new Date())
			: null;
		if (!notification) return fail(404, { error: '通知が見つかりません。' });
		const link = safeLink(notification.link);
		if (link) redirect(303, link);
		return { message: '既読にしました。' };
	},
	readAll: ({ locals }) => {
		requireSignedIn(locals);
		const count = getServices().notifications.markAllRead(locals.user.id, new Date());
		return { message: count > 0 ? `${count} 件を既読にしました。` : '未読の通知はありません。' };
	},
};
