// ログインと新規登録を許すかどうかの判断。I/O は持たない。
// Google の ID トークンの中身と、DB から引いた情報を受け取り、結果を返す。
// `hd` は画面上のヒントにすぎないので、ここでサーバー側で確かめる。

export type Registration = 'invite' | 'open' | 'closed';

/** 署名を確かめたあとの ID トークンから取り出した値 */
export interface GoogleClaims {
	readonly sub: string;
	readonly email: string;
	readonly emailVerified: boolean;
	/** Google Workspace のドメイン。大学のアカウントなら fun.ac.jp。個人の Gmail にはない */
	readonly hd?: string;
	readonly name?: string;
}

export interface ExistingUser {
	readonly id: string;
	readonly status: 'active' | 'suspended';
	readonly role: 'user' | 'moderator' | 'admin';
}

/** 提示された招待コードの状態 (コードが存在しなければ null を渡す) */
export interface InviteCodeState {
	readonly id: number;
	readonly maxUses: number;
	readonly usedCount: number;
	readonly expiresAt: Date | null;
	readonly revoked: boolean;
}

export interface SignInInput {
	readonly claims: GoogleClaims;
	/** ALLOWED_EMAIL_DOMAINS */
	readonly allowedDomains: readonly string[];
	readonly registration: Registration;
	/** ADMIN_EMAILS */
	readonly adminEmails: readonly string[];
	/** Google の sub で引いた、登録済みの利用者。いなければ null */
	readonly existingUser: ExistingUser | null;
	/** 登録の前に受け取った招待コード。なければ null */
	readonly invite: InviteCodeState | null;
	/**
	 * このメールアドレスが、管理者が用意したテストアカウントか。そうなら、大学のドメインでなくても、登録の方式を問わずに入れる (メールアドレスの確認は、これまでどおり要る)
	 */
	readonly testAccount?: boolean;
	readonly now: Date;
}

export type DenyReason =
	| 'email-not-verified'
	| 'domain-not-allowed'
	| 'hd-mismatch'
	| 'suspended'
	| 'registration-closed'
	| 'invite-required'
	| 'invite-revoked'
	| 'invite-expired'
	| 'invite-used-up';

export type SignInDecision =
	| { readonly kind: 'sign-in'; readonly userId: string; readonly promoteToAdmin: boolean }
	| {
			readonly kind: 'sign-up';
			readonly role: 'user' | 'moderator' | 'admin';
			/** 登録に使った招待コード。使わなければ null */
			readonly inviteCodeId: number | null;
	  }
	| { readonly kind: 'denied'; readonly reason: DenyReason };

const denied = (reason: DenyReason): SignInDecision => ({ kind: 'denied', reason });

function inviteProblem(invite: InviteCodeState, now: Date): DenyReason | undefined {
	if (invite.revoked) return 'invite-revoked';
	if (invite.expiresAt !== null && now.getTime() >= invite.expiresAt.getTime()) {
		return 'invite-expired';
	}
	if (invite.usedCount >= invite.maxUses) return 'invite-used-up';
	return undefined;
}

export function decideSignIn(input: SignInInput): SignInDecision {
	const { claims, existingUser, now } = input;
	const allowed = input.allowedDomains.map((domain) => domain.toLowerCase());

	if (!claims.emailVerified) return denied('email-not-verified');

	const email = claims.email.toLowerCase();
	const at = email.lastIndexOf('@');
	const domain = at > 0 ? email.slice(at + 1) : '';
	// 末尾が一致するだけの似た名前のドメインを許さないよう、ドメインの全体を比べる
	const isTest = input.testAccount === true;
	if (!isTest) {
		if (!allowed.includes(domain)) return denied('domain-not-allowed');
		if (!claims.hd || !allowed.includes(claims.hd.toLowerCase())) return denied('hd-mismatch');
	}

	const isAdminEmail = input.adminEmails.some((admin) => admin.toLowerCase() === email);

	if (existingUser) {
		if (existingUser.status === 'suspended') return denied('suspended');
		return {
			kind: 'sign-in',
			userId: existingUser.id,
			promoteToAdmin: isAdminEmail && existingUser.role !== 'admin',
		};
	}

	if (isTest) return { kind: 'sign-up', role: 'user', inviteCodeId: null };

	const validInvite = input.invite && !inviteProblem(input.invite, now) ? input.invite : null;

	// ADMIN_EMAILS の人は、最初にログインできるように、登録の方式や招待コードを問わない
	if (isAdminEmail) {
		return { kind: 'sign-up', role: 'admin', inviteCodeId: validInvite?.id ?? null };
	}

	switch (input.registration) {
		case 'closed':
			return denied('registration-closed');
		case 'open':
			return { kind: 'sign-up', role: 'user', inviteCodeId: validInvite?.id ?? null };
		case 'invite': {
			if (!input.invite) return denied('invite-required');
			const problem = inviteProblem(input.invite, now);
			if (problem) return denied(problem);
			return { kind: 'sign-up', role: 'user', inviteCodeId: input.invite.id };
		}
	}
}
