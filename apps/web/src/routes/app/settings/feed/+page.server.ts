// 通知のフィード (RSS、Atom、JSON Feed) の設定。購読 URL を発行、再発行、無効にする。
// URL のトークンは DB にハッシュだけを保存するので、URL は発行の直後に 1 回だけ出す
import { fail, type Actions, type ServerLoad } from '@sveltejs/kit';
import { DEFAULT_CHANNEL_KINDS, type NotificationKind } from '@funmary/db';
import { CHANNEL_KIND_OPTIONS, parseChannelKinds } from '#lib/server/channel-kind-form.ts';
import { formatJstDateTime } from '#lib/server/invites.ts';
import { notificationFeedLinks } from '#lib/server/notification-feed.ts';
import { getServices } from '#lib/server/services.ts';
import { requireSignedIn } from '#lib/server/admin.ts';

function kindsOf(options: Record<string, unknown> | null): NotificationKind[] {
	const raw = options?.kinds;
	return Array.isArray(raw) ? (raw as NotificationKind[]) : [...DEFAULT_CHANNEL_KINDS];
}

export const load: ServerLoad = ({ locals }) => {
	requireSignedIn(locals);
	const current = getServices().feedTokens.current(locals.user.id, 'feed');
	return {
		subscription: current && {
			createdAt: formatJstDateTime(current.createdAt),
			lastUsedAt: current.lastUsedAt && formatJstDateTime(current.lastUsedAt),
		},
		kinds: current ? kindsOf(current.options) : null,
		kindOptions: CHANNEL_KIND_OPTIONS,
	};
};

export const actions: Actions = {
	issue: ({ locals }) => {
		requireSignedIn(locals);
		const services = getServices();
		const token = services.feedTokens.issue(locals.user.id, 'feed', new Date());
		return { issued: notificationFeedLinks(services.origin, token) };
	},
	revoke: ({ locals }) => {
		requireSignedIn(locals);
		getServices().feedTokens.revoke(locals.user.id, 'feed', new Date());
		return { message: '購読 URL を無効にしました。フィードリーダーで通知は更新されません。' };
	},
	/** フィードに載せる通知の種類を保存する */
	kinds: async ({ request, locals }) => {
		requireSignedIn(locals);
		const services = getServices();
		if (!services.feedTokens.current(locals.user.id, 'feed')) {
			return fail(400, { error: '購読 URL を、先に発行してください。' });
		}
		const kinds = parseChannelKinds(await request.formData());
		if (!kinds)
			return fail(400, { error: 'フィードに載せる通知の種類を、1 つ以上選んでください。' });
		services.feedTokens.setOptions(locals.user.id, 'feed', { kinds });
		return { message: 'フィードに載せる通知の種類を保存しました。' };
	},
};
