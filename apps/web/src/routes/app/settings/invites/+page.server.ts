// 招待コードの発行。発行できる人は、管理画面のモードで決まる。
// 発行したコードは DB にハッシュだけを保存するので、発行の直後に 1 回だけ画面に出す。
import { fail, type Actions, type ServerLoad } from '@sveltejs/kit';
import { parseInviteForm } from '#lib/server/invite-form.ts';
import {
	formatJstDateTime,
	issueInvite,
	loadInviteStatus,
	revokeInvite,
	usableInviteCodes,
} from '#lib/server/invites.ts';
import { readRegistration } from '#lib/server/registration.ts';
import { getServices } from '#lib/server/services.ts';
import { requireSignedIn } from '#lib/server/admin.ts';

export const load: ServerLoad = ({ locals }) => {
	requireSignedIn(locals);
	const services = getServices();
	const now = new Date();
	const { issuance } = loadInviteStatus(services, locals.user, now);
	return {
		issuance,
		registration: readRegistration(services.settings),
		codes: usableInviteCodes(services.auth.listInviteCodes({ createdBy: locals.user.id }), now),
	};
};

export const actions: Actions = {
	issue: async ({ request, locals }) => {
		requireSignedIn(locals);
		const parsed = parseInviteForm(await request.formData());
		if (!parsed.ok) return fail(400, { error: parsed.error });
		const services = getServices();
		const result = issueInvite(services, locals.user, parsed.value, new Date());
		switch (result.kind) {
			case 'not-allowed':
				return fail(403, { error: '招待コードを発行する権限がありません。' });
			case 'limit-reached':
				return fail(429, {
					error: `今月は、招待コードを発行できる数 (${result.limit} つ) に達しました。`,
				});
			case 'issued':
				// 渡した相手のメモなど、個人情報は含めない
				await services.alertAdmin({
					severity: 'info',
					title: '招待コードが発行されました',
					category: 'users',
					key: `invite-issued:${Date.now()}`,
				});
				return {
					issued: {
						code: result.code,
						url: `${services.origin}/signup?code=${encodeURIComponent(result.code)}`,
						expiresAt: result.expiresAt && formatJstDateTime(result.expiresAt),
					},
				};
		}
	},
	revoke: async ({ request, locals }) => {
		requireSignedIn(locals);
		const id = Number((await request.formData()).get('id'));
		if (!Number.isInteger(id) || !revokeInvite(getServices(), locals.user, id, new Date())) {
			return fail(404, { error: '取り消せる招待コードが見つかりません。' });
		}
		return { message: '招待コードを取り消しました。' };
	},
};
