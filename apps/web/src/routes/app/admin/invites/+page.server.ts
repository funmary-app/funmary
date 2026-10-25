// 登録と招待の管理。新規登録の方式、招待コードを発行できる人のモードと月の上限を変え、全員のコードを見て取り消し、
// 利用者ごとに発行の権限を付ける。発行そのものは /app/settings/invites で行う (管理者も同じ画面を使う)。
import { fail, type Actions, type ServerLoad } from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/admin.ts';
import { parseInviteSettingsForm } from '#lib/server/invite-form.ts';
import {
	readInviteSettings,
	revokeInvite,
	saveInviteSettings,
	usableInviteCodes,
} from '#lib/server/invites.ts';
import { parseRegistration, readRegistration, saveRegistration } from '#lib/server/registration.ts';
import { getServices } from '#lib/server/services.ts';

export const load: ServerLoad = ({ locals }) => {
	requireAdmin(locals);
	const services = getServices();
	const now = new Date();
	return {
		settings: readInviteSettings(services.settings),
		registration: readRegistration(services.settings),
		codes: usableInviteCodes(services.auth.listInviteCodes(), now),
		// 管理者は権限がなくても発行できるので、権限を付ける対象は管理者でない人だけ
		users: services.auth
			.listUsers()
			.filter((user) => user.role !== 'admin')
			.map((user) => ({
				id: user.id,
				email: user.email,
				suspended: user.status === 'suspended',
				canInvite: user.permissions.includes('invite:create'),
			})),
	};
};

export const actions: Actions = {
	saveRegistration: async ({ request, locals }) => {
		requireAdmin(locals);
		const registration = parseRegistration((await request.formData()).get('registration'));
		if (!registration) return fail(400, { error: '登録の方式を選んでください。' });
		saveRegistration(getServices().settings, registration, new Date());
		return { message: '登録の方式を保存しました。' };
	},
	saveSettings: async ({ request, locals }) => {
		requireAdmin(locals);
		const { settings } = getServices();
		const parsed = parseInviteSettingsForm(await request.formData(), readInviteSettings(settings));
		if (!parsed.ok) return fail(400, { error: parsed.error });
		saveInviteSettings(settings, parsed.value, new Date());
		return { message: '招待コードを発行できる人の設定を保存しました。' };
	},
	revoke: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const id = Number((await request.formData()).get('id'));
		if (!Number.isInteger(id) || !revokeInvite(getServices(), admin, id, new Date())) {
			return fail(404, { error: '取り消せる招待コードが見つかりません。' });
		}
		return { message: '招待コードを取り消しました。' };
	},
	setPermission: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		const userId = form.get('userId');
		const granted = form.get('granted') === 'true';
		const { auth } = getServices();
		const target = typeof userId === 'string' ? auth.findUserById(userId) : null;
		if (!target || target.role === 'admin') {
			return fail(404, { error: '利用者が見つかりません。' });
		}
		auth.setPermission(target.id, 'invite:create', granted, admin.id, new Date());
		// メールアドレスなど、個人情報は含めない
		await getServices().alertAdmin({
			severity: 'info',
			title: granted ? '招待コードの発行を許可しました' : '招待コードの発行の許可を外しました',
			category: 'users',
			key: `permission:${target.id}:${granted}:${Date.now()}`,
		});
		return {
			message: granted
				? `${target.email} に、招待コードの発行を許可しました。`
				: `${target.email} の、招待コードの発行の許可を外しました。`,
		};
	},
};
