// 利用規約とプライバシーポリシーへの (再) 同意画面。登録のあと、そして規約を更新したときに、ログインしている全員が通る。
// 同意するまで、アプリ、公開 API、MCP、Discord、購読、通知の配信をすべて止めている (hooks.server.ts ほか)。
import { hasAcceptedTerms } from '@funmary/core';
import { fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import {
	CURRENT_TERMS_VERSION,
	PRIVACY_UPDATED_AT,
	TERMS_UPDATED_AT,
} from '#lib/legal-versions.ts';
import { safeNextPath } from '#lib/server/consent-gate.ts';
import { getServices } from '#lib/server/services.ts';
import { requireSignedIn } from '#lib/server/admin.ts';

export const load: ServerLoad = ({ locals, url }) => {
	requireSignedIn(locals);
	// 同意済みなら、この画面は要らない (同意のあとに戻ってきても、行き先へ進む)
	if (hasAcceptedTerms(locals.user.termsAcceptedVersion, CURRENT_TERMS_VERSION)) {
		redirect(303, safeNextPath(url.searchParams.get('next')));
	}
	return {
		email: locals.user.email,
		// 初めての同意か、規約の更新による再同意か。画面の文言を変える
		reconsent: locals.user.termsAcceptedVersion !== null,
		termsUpdatedAt: TERMS_UPDATED_AT,
		privacyUpdatedAt: PRIVACY_UPDATED_AT,
	};
};

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		requireSignedIn(locals);
		const form = await request.formData();
		if (form.get('agree') !== 'on') {
			return fail(400, { error: '同意する場合は、チェックを入れてください。' });
		}
		// 画面を開いたあとに規約が更新されていても、いまの版に同意したことにしない (画面に出した版を記録する)
		if (form.get('version') !== CURRENT_TERMS_VERSION) {
			return fail(409, {
				error: '規約が更新されました。内容をもう一度確かめて、同意してください。',
			});
		}
		getServices().auth.acceptTerms(locals.user.id, CURRENT_TERMS_VERSION, new Date());
		redirect(303, safeNextPath(url.searchParams.get('next')));
	},
};
