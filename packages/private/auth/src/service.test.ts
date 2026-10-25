import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuthStore, openDatabase, type AuthStore, type Database } from '@funmary/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GoogleClaims, Registration } from './sign-in-policy.ts';
import { createAuthService, FLOW_TTL_MS, type OidcClient } from './service.ts';

let dir: string;
let database: Database;
let store: AuthStore;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'funmary-service-'));
	database = openDatabase(join(dir, 'funmary.db'), { backupDir: join(dir, 'backups') });
	store = createAuthStore(database);
});

afterEach(() => {
	database.close();
	rmSync(dir, { recursive: true, force: true });
});

const T0 = new Date('2026-10-01T00:00:00Z');

const CLAIMS: GoogleClaims = {
	sub: 'g-1',
	email: 'taro@fun.ac.jp',
	emailVerified: true,
	hd: 'fun.ac.jp',
	name: '山田 太郎',
};

/** Google の代わり。認可の URL を作り、戻りの URL から、決めておいた値を返す */
function fakeOidc(claims: GoogleClaims | Error) {
	const calls: { expected?: { state: string; nonce: string; codeVerifier: string } } = {};
	const oidc: OidcClient = {
		createAuthorization() {
			return Promise.resolve({
				url: 'https://accounts.example/auth?x=1',
				state: 'STATE',
				nonce: 'NONCE',
				codeVerifier: 'VERIFIER',
			});
		},
		exchange(_callbackUrl, expected) {
			calls.expected = expected;
			return claims instanceof Error ? Promise.reject(claims) : Promise.resolve(claims);
		},
	};
	return { oidc, calls };
}

function service(
	over: {
		claims?: GoogleClaims | Error;
		registration?: Registration;
		adminEmails?: string[];
		now?: () => Date;
	} = {},
) {
	const { oidc, calls } = fakeOidc(over.claims ?? CLAIMS);
	const svc = createAuthService({
		oidc,
		store,
		allowedDomains: ['fun.ac.jp'],
		registration: () => over.registration ?? 'invite',
		adminEmails: over.adminEmails ?? [],
		now: over.now ?? (() => T0),
	});
	return { svc, calls };
}

const callback = new URL('https://funmary.example.com/auth/google/callback?code=abc&state=STATE');

describe('startLogin', () => {
	it('Google の認可の URL と、戻ってきたときに確かめる値 (flow) を返す', async () => {
		const { svc } = service();
		const result = await svc.startLogin({ inviteCode: null });
		expect(result).toEqual({
			redirectTo: 'https://accounts.example/auth?x=1',
			flow: {
				state: 'STATE',
				nonce: 'NONCE',
				codeVerifier: 'VERIFIER',
				inviteCode: null,
				startedAt: T0.getTime(),
			},
		});
	});

	it('招待コードは、flow に持たせて、戻ってから確かめる', async () => {
		const { svc } = service();
		const result = await svc.startLogin({ inviteCode: 'CODE' });
		expect(result.flow.inviteCode).toBe('CODE');
	});
});

describe('checkInviteCode (/signup?code=... で、Google に進む前に確かめる)', () => {
	it('有効なコードなら valid、なければ invalid と理由を返す', () => {
		const { svc } = service();
		const code = store.createInviteCode({ maxUses: 1 }, T0);
		expect(svc.checkInviteCode(code)).toEqual({ kind: 'valid' });
		expect(svc.checkInviteCode('ない')).toEqual({ kind: 'invalid', reason: 'unknown' });

		const revoked = store.createInviteCode({ maxUses: 1 }, T0);
		store.revokeInviteCode(store.findInviteCode(revoked)!.id, T0);
		expect(svc.checkInviteCode(revoked)).toEqual({ kind: 'invalid', reason: 'invite-revoked' });

		const expired = store.createInviteCode(
			{ maxUses: 1, expiresAt: new Date('2026-09-01T00:00:00Z') },
			T0,
		);
		expect(svc.checkInviteCode(expired)).toEqual({ kind: 'invalid', reason: 'invite-expired' });
	});
});

describe('completeLogin: 新規登録', () => {
	it('招待コードがあれば登録し、セッションを作り、コードの使用回数を増やす', async () => {
		const { svc, calls } = service();
		const code = store.createInviteCode({ maxUses: 1 }, T0);
		const { flow } = await svc.startLogin({ inviteCode: code });

		const result = await svc.completeLogin({ callbackUrl: callback, flow });

		expect(result.kind).toBe('signed-in');
		if (result.kind !== 'signed-in') return;
		expect(result.isNewUser).toBe(true);
		expect(result.user).toMatchObject({ email: 'taro@fun.ac.jp', role: 'user', name: '山田 太郎' });
		expect(store.resolveSession(result.sessionToken, T0)?.email).toBe('taro@fun.ac.jp');
		expect(store.findInviteCode(code)?.usedCount).toBe(1);
		// Google に、始めたときの値を確かめさせている
		expect(calls.expected).toEqual({ state: 'STATE', nonce: 'NONCE', codeVerifier: 'VERIFIER' });
	});

	it('招待コードがなければ、登録せず、理由を返す (利用者もセッションも作らない)', async () => {
		const { svc } = service();
		const { flow } = await svc.startLogin({ inviteCode: null });
		expect(await svc.completeLogin({ callbackUrl: callback, flow })).toEqual({
			kind: 'denied',
			reason: 'invite-required',
		});
		expect(store.findUserBySub('g-1')).toBeNull();
	});

	it('登録の方式は、ログインのたびに読む (管理画面で変えると、再起動しなくても効く)', async () => {
		let registration: Registration = 'invite';
		const { oidc } = fakeOidc(CLAIMS);
		const svc = createAuthService({
			oidc,
			store,
			allowedDomains: ['fun.ac.jp'],
			registration: () => registration,
			adminEmails: [],
			now: () => T0,
		});
		const first = await svc.startLogin({ inviteCode: null });
		expect(await svc.completeLogin({ callbackUrl: callback, flow: first.flow })).toMatchObject({
			kind: 'denied',
		});

		registration = 'open';
		const second = await svc.startLogin({ inviteCode: null });
		expect(await svc.completeLogin({ callbackUrl: callback, flow: second.flow })).toMatchObject({
			kind: 'signed-in',
			isNewUser: true,
		});
	});

	it('使い切ったコードなら、登録せず、理由を返す', async () => {
		const { svc } = service();
		const code = store.createInviteCode({ maxUses: 1 }, T0);
		store.registerUser(
			{ googleSub: 'other', email: 'x@fun.ac.jp', name: null, role: 'user' },
			{ inviteCodeId: store.findInviteCode(code)!.id },
			T0,
		);
		const { flow } = await svc.startLogin({ inviteCode: code });
		expect(await svc.completeLogin({ callbackUrl: callback, flow })).toEqual({
			kind: 'denied',
			reason: 'invite-used-up',
		});
		expect(store.findUserBySub('g-1')).toBeNull();
	});

	it('ADMIN_EMAILS の人は、招待コードなしで、管理者として登録できる', async () => {
		const { svc } = service({ adminEmails: ['taro@fun.ac.jp'] });
		const { flow } = await svc.startLogin({ inviteCode: null });
		const result = await svc.completeLogin({ callbackUrl: callback, flow });
		expect(result).toMatchObject({ kind: 'signed-in', isNewUser: true, user: { role: 'admin' } });
	});

	it('大学のアカウントでなければ、登録しない (open でも)', async () => {
		const { svc } = service({
			registration: 'open',
			claims: { sub: 'g-9', email: 'a@gmail.com', emailVerified: true },
		});
		const { flow } = await svc.startLogin({ inviteCode: null });
		expect(await svc.completeLogin({ callbackUrl: callback, flow })).toMatchObject({
			kind: 'denied',
		});
		expect(store.findUserBySub('g-9')).toBeNull();
	});
});

describe('completeLogin: 登録済みの利用者', () => {
	it('招待コードなしでログインでき、最後のログインの時刻と名前を更新する', async () => {
		const id = store.createUser(
			{ googleSub: 'g-1', email: 'taro@fun.ac.jp', name: '古い名前', role: 'user' },
			new Date('2026-09-01T00:00:00Z'),
		);
		const { svc } = service();
		const { flow } = await svc.startLogin({ inviteCode: null });
		const result = await svc.completeLogin({ callbackUrl: callback, flow });
		expect(result).toMatchObject({
			kind: 'signed-in',
			isNewUser: false,
			user: { id, name: '山田 太郎' },
		});
	});

	it('停止された利用者は、ログインできない', async () => {
		const id = store.createUser(
			{ googleSub: 'g-1', email: 'taro@fun.ac.jp', name: null, role: 'user' },
			T0,
		);
		store.setStatus(id, 'suspended');
		const { svc } = service();
		const { flow } = await svc.startLogin({ inviteCode: null });
		expect(await svc.completeLogin({ callbackUrl: callback, flow })).toEqual({
			kind: 'denied',
			reason: 'suspended',
		});
	});

	it('ADMIN_EMAILS に書かれていれば、ログインしたときに管理者にする', async () => {
		store.createUser({ googleSub: 'g-1', email: 'taro@fun.ac.jp', name: null, role: 'user' }, T0);
		const { svc } = service({ adminEmails: ['taro@fun.ac.jp'] });
		const { flow } = await svc.startLogin({ inviteCode: null });
		expect(await svc.completeLogin({ callbackUrl: callback, flow })).toMatchObject({
			kind: 'signed-in',
			user: { role: 'admin' },
		});
	});
});

describe('completeLogin: 失敗', () => {
	it('始めてから 10 分たった flow は、受け付けない', async () => {
		let now = T0;
		const { svc } = service({ now: () => now });
		const { flow } = await svc.startLogin({ inviteCode: null });
		now = new Date(T0.getTime() + FLOW_TTL_MS + 1);
		expect(FLOW_TTL_MS).toBe(10 * 60 * 1000);
		expect(await svc.completeLogin({ callbackUrl: callback, flow })).toEqual({
			kind: 'failed',
			reason: 'flow-expired',
		});
	});

	it('Google の応答の確認 (state、nonce、署名、コードの交換) に失敗したら、失敗として返し、何も作らない', async () => {
		const { svc } = service({ claims: new Error('state が合わない') });
		const { flow } = await svc.startLogin({ inviteCode: null });
		expect(await svc.completeLogin({ callbackUrl: callback, flow })).toEqual({
			kind: 'failed',
			reason: 'invalid-callback',
		});
		expect(store.findUserBySub('g-1')).toBeNull();
	});
});
