// ログインの流れ全体。Google との通信 (OidcClient) と、DB (AuthStore) を受け取り、
// ログインの開始、招待コードの確認、戻ってきたあとの登録とセッションの発行を行う。
// Google との通信の中身 (PKCE、state、nonce、署名の検証) は OidcClient が受け持つ。ここでは、その結果の扱いを決める。
import type { AuthStore, AuthUser } from '@funmary/db';
import {
	decideSignIn,
	type DenyReason,
	type GoogleClaims,
	type InviteCodeState,
	type Registration,
} from './sign-in-policy.ts';

/** ログインを始めてから、戻ってくるまでに許す時間 */
export const FLOW_TTL_MS = 10 * 60 * 1000;

/** Google に渡した値。戻ってきたときに、確かめるために使う */
export interface OidcAuthorization {
	readonly url: string;
	readonly state: string;
	readonly nonce: string;
	readonly codeVerifier: string;
}

export interface OidcClient {
	/** PKCE、state、nonce を作り、認可の URL を返す。hd=fun.ac.jp を付けて、大学のアカウントが選ばれやすくする */
	createAuthorization(options?: {
		readonly hostedDomainHint?: boolean;
	}): Promise<OidcAuthorization>;
	/**
	 * 戻ってきた URL の state を確かめ、コードを ID トークンに交換し、署名と nonce を確かめて、中身を返す。
	 * どれかが合わなければ例外を投げる
	 */
	exchange(
		callbackUrl: URL,
		expected: { state: string; nonce: string; codeVerifier: string },
	): Promise<GoogleClaims>;
}

/** ログインを始めてから戻るまでの間、ブラウザ (暗号化した Cookie) に預けておく値 */
export interface LoginFlow {
	readonly state: string;
	readonly nonce: string;
	readonly codeVerifier: string;
	readonly inviteCode: string | null;
	/** 始めた時刻 (ミリ秒) */
	readonly startedAt: number;
}

export type InviteCheck =
	| { readonly kind: 'valid' }
	| { readonly kind: 'invalid'; readonly reason: 'unknown' | DenyReason };

export type CompleteLoginResult =
	| {
			readonly kind: 'signed-in';
			/** Cookie に渡すセッションの ID */
			readonly sessionToken: string;
			readonly user: AuthUser;
			readonly isNewUser: boolean;
	  }
	| { readonly kind: 'denied'; readonly reason: DenyReason }
	| { readonly kind: 'failed'; readonly reason: 'flow-expired' | 'invalid-callback' };

export interface AuthService {
	startLogin(input: {
		inviteCode: string | null;
		/** 管理者が用意したテストアカウントでログインする入口。Google のアカウントの選択に、大学のドメインの絞り込みを付けない */
		testAccount?: boolean;
	}): Promise<{ redirectTo: string; flow: LoginFlow }>;
	/** /signup?code=... で、Google に進む前にコードを確かめる */
	checkInviteCode(code: string): InviteCheck;
	completeLogin(input: { callbackUrl: URL; flow: LoginFlow }): Promise<CompleteLoginResult>;
}

export interface AuthServiceOptions {
	readonly oidc: OidcClient;
	readonly store: AuthStore;
	/** ALLOWED_EMAIL_DOMAINS */
	readonly allowedDomains: readonly string[];
	/** 新規登録の方式。管理画面で変えられるので、ログインのたびに読む */
	readonly registration: () => Registration;
	/** ADMIN_EMAILS */
	readonly adminEmails: readonly string[];
	/** 管理者が用意したテストアカウントのメールアドレスか。ないときは、テストアカウントを認めない */
	readonly isTestAccount?: (email: string) => boolean;
	readonly now?: () => Date;
}

function inviteState(store: AuthStore, code: string | null): InviteCodeState | null {
	return code ? store.findInviteCode(code) : null;
}

export function createAuthService(options: AuthServiceOptions): AuthService {
	const { oidc, store } = options;
	const now = options.now ?? (() => new Date());

	return {
		async startLogin({ inviteCode, testAccount = false }) {
			// テストアカウントは、大学のアカウントではないので、Google のアカウントの選択に hd の絞り込みを付けない
			const authorization = await oidc.createAuthorization({ hostedDomainHint: !testAccount });
			return {
				redirectTo: authorization.url,
				flow: {
					state: authorization.state,
					nonce: authorization.nonce,
					codeVerifier: authorization.codeVerifier,
					inviteCode,
					startedAt: now().getTime(),
				},
			};
		},

		checkInviteCode(code) {
			const invite = store.findInviteCode(code);
			if (!invite) return { kind: 'invalid', reason: 'unknown' };
			if (invite.revoked) return { kind: 'invalid', reason: 'invite-revoked' };
			if (invite.expiresAt !== null && now().getTime() >= invite.expiresAt.getTime()) {
				return { kind: 'invalid', reason: 'invite-expired' };
			}
			if (invite.usedCount >= invite.maxUses) return { kind: 'invalid', reason: 'invite-used-up' };
			return { kind: 'valid' };
		},

		async completeLogin({ callbackUrl, flow }) {
			const at = now();
			if (at.getTime() - flow.startedAt > FLOW_TTL_MS) {
				return { kind: 'failed', reason: 'flow-expired' };
			}

			let claims: GoogleClaims;
			try {
				claims = await oidc.exchange(callbackUrl, {
					state: flow.state,
					nonce: flow.nonce,
					codeVerifier: flow.codeVerifier,
				});
			} catch {
				// 理由 (state が違う、署名が違うなど) は、攻撃の手がかりになるので、外には出さない
				return { kind: 'failed', reason: 'invalid-callback' };
			}

			const existing = store.findUserBySub(claims.sub);
			const decision = decideSignIn({
				claims,
				allowedDomains: options.allowedDomains,
				registration: options.registration(),
				adminEmails: options.adminEmails,
				existingUser: existing
					? { id: existing.id, status: existing.status, role: existing.role }
					: null,
				invite: inviteState(store, flow.inviteCode),
				testAccount: options.isTestAccount?.(claims.email) ?? false,
				now: at,
			});

			if (decision.kind === 'denied') return { kind: 'denied', reason: decision.reason };

			if (decision.kind === 'sign-in') {
				store.recordLogin(decision.userId, at, {
					...(claims.name !== undefined && { name: claims.name }),
					...(decision.promoteToAdmin && { role: 'admin' as const }),
				});
				const user = store.findUserById(decision.userId)!;
				return {
					kind: 'signed-in',
					sessionToken: store.createSession(user.id, at),
					user,
					isNewUser: false,
				};
			}

			const registered = store.registerUser(
				{
					googleSub: claims.sub,
					email: claims.email.toLowerCase(),
					name: claims.name ?? null,
					role: decision.role,
				},
				{ inviteCodeId: decision.inviteCodeId },
				at,
			);
			if (registered.kind === 'invite-unavailable') {
				// 判断のあと、登録までの間に、ほかの人が使い切った
				return { kind: 'denied', reason: 'invite-used-up' };
			}
			const user = store.findUserById(registered.userId)!;
			return {
				kind: 'signed-in',
				sessionToken: store.createSession(user.id, at),
				user,
				isNewUser: true,
			};
		},
	};
}
