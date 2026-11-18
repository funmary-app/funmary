// 管理者のテストアカウント。大学のアカウントでない Google のアカウント (メールアドレス) を足すと、そのアカウントでログインして、機能を試せる。管理者ごとに持ち、データは引き継がない。必要なときだけ、管理者のデータを写す。
import { MAX_TEST_ACCOUNTS_PER_ADMIN } from '@funmary/db';
import { fail, type Actions, type ServerLoad } from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/admin.ts';
import { formatJstDateTime } from '#lib/server/invites.ts';
import { getServices } from '#lib/server/services.ts';

const ADD_ERRORS = {
	invalid: 'メールアドレスの形が正しくありません。',
	university: '大学のアカウントは、そのまま登録できるので、足せません。',
	taken: 'このメールアドレスは、すでに利用者か、ほかのテストアカウントにあります。',
	limit: `テストアカウントは、1 人 ${MAX_TEST_ACCOUNTS_PER_ADMIN} 個までです。`,
} as const;

export const load: ServerLoad = ({ locals }) => {
	const admin = requireAdmin(locals);
	const { testAccounts } = getServices();
	return {
		accounts: testAccounts.list(admin.id).map((account) => ({
			id: account.id,
			email: account.email,
			registered: account.userId !== null,
			lastLoginAt: account.lastLoginAt && formatJstDateTime(account.lastLoginAt),
		})),
		limit: MAX_TEST_ACCOUNTS_PER_ADMIN,
	};
};

const idOf = async (request: Request) => Number((await request.formData()).get('id'));

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const { testAccounts, universityDomains } = getServices();
		const email = (await request.formData()).get('email');
		const result = testAccounts.add(
			admin.id,
			typeof email === 'string' ? email : '',
			{ universityDomains },
			new Date(),
		);
		if (result.kind !== 'added') return fail(400, { error: ADD_ERRORS[result.kind] });
		return {
			message: 'テストアカウントを足しました。そのアカウントで、ログインの画面の案内から入れます。',
		};
	},
	copy: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const id = await idOf(request);
		if (
			!Number.isInteger(id) ||
			!getServices().testAccounts.copyFromOwner(admin.id, id, new Date())
		) {
			return fail(400, { error: 'まだログインしていないアカウントには、写せません。' });
		}
		return { message: '自分の履修科目、曜日と時限、予定を、テストアカウントに写しました。' };
	},
	remove: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const id = await idOf(request);
		if (!Number.isInteger(id) || !getServices().testAccounts.remove(admin.id, id)) {
			return fail(404, { error: 'テストアカウントが見つかりません。' });
		}
		return { message: 'テストアカウントと、そのデータを消しました。' };
	},
};
