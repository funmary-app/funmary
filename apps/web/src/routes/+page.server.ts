// 紹介の画面。ログインしているかどうかにかかわらず出す。アプリは /app の下にある。
import type { ServerLoad } from '@sveltejs/kit';
import { parseInviteCodeParam } from '#lib/invite-code-param.ts';
import { readRegistration } from '#lib/server/registration.ts';
import { getServices } from '#lib/server/services.ts';

export const load: ServerLoad = ({ locals, url }) => {
	const registration = readRegistration(getServices().settings);
	return {
		signedIn: locals.user !== null,
		registration,
		// 招待コードのリンク (/?code=...) で来たときは、入力欄に入れておく。招待制のときだけ
		inviteCode:
			registration === 'invite' && locals.user === null
				? parseInviteCodeParam(url.searchParams.get('code'))
				: null,
	};
};
