// 利用者、セッション、招待コード、利用者の権限の保存。
// セッションの ID と招待コードは、DB には SHA-256 だけを保存する。DB が漏れても、そのまま使われないようにするため。
import { randomBytes } from 'node:crypto';
import type { Permission } from '@funmary/core';
import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import type { Database } from './database.ts';
import { generateToken, hashToken } from './secrets.ts';
import { inviteCodes, sessions, termsAcceptances, userPermissions, users } from './schema.ts';

/** セッションの有効期限。使うたびに延ばす */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * user (何もできない一般の利用者)、moderator (監査ログや、曜日と時限の確認待ちを見られる)、admin (すべて) の 3 段階。管理用コマンドの user promote で変える
 */
export type UserRole = 'user' | 'moderator' | 'admin';

export interface AuthUser {
	readonly id: string;
	readonly email: string;
	readonly name: string | null;
	readonly role: UserRole;
	readonly status: 'active' | 'suspended';
	/** 同意した利用規約とプライバシーポリシーの版。一度も同意していなければ null */
	readonly termsAcceptedVersion: string | null;
}

export interface NewUser {
	readonly googleSub: string;
	readonly email: string;
	readonly name: string | null;
	readonly role: UserRole;
}

export interface InviteCodeRecord {
	readonly id: number;
	readonly maxUses: number;
	readonly usedCount: number;
	readonly expiresAt: Date | null;
	readonly revoked: boolean;
}

export type RegisterResult =
	| { readonly kind: 'created'; readonly userId: string }
	/** 招待コードが、使い切り、期限切れ、取り消し済みなどで使えなかった。利用者は作られていない */
	| { readonly kind: 'invite-unavailable' };

export interface AuthStore {
	findUserBySub(googleSub: string): AuthUser | null;
	findUserById(id: string): AuthUser | null;
	/** 大文字と小文字は区別しない (管理用コマンドの user が使う) */
	findUserByEmail(email: string): AuthUser | null;
	/** 招待コードを使わずに利用者を作る。作った利用者の ID を返す */
	createUser(user: NewUser, now: Date): string;
	/** 利用者の作成と、招待コードの使用を、1 つのトランザクションで行う */
	registerUser(user: NewUser, invite: { inviteCodeId: number | null }, now: Date): RegisterResult;
	recordLogin(userId: string, now: Date, update?: { name?: string | null; role?: UserRole }): void;
	/** 停止すると、その利用者のセッションもすべて消す */
	setStatus(userId: string, status: 'active' | 'suspended'): void;
	setRole(userId: string, role: UserRole): void;
	/** 利用規約とプライバシーポリシーの、この版への同意を記録する (履歴にも残す)。同じ版を続けて記録しても 1 件 */
	acceptTerms(userId: string, version: string, now: Date): void;

	/** セッションを作り、Cookie に渡す ID を返す */
	createSession(userId: string, now: Date): string;
	/** 有効なセッションの利用者を返す。使うたびに有効期限を延ばす。停止された利用者は null */
	resolveSession(token: string, now: Date): AuthUser | null;
	deleteSession(token: string): void;
	purgeExpiredSessions(now: Date): number;

	/** 招待コードを発行し、コードを返す (DB には SHA-256 だけを保存する) */
	createInviteCode(
		options: {
			maxUses: number;
			expiresAt?: Date | null;
			note?: string | null;
			createdBy?: string | null;
		},
		now: Date,
	): string;
	findInviteCode(code: string): InviteCodeRecord | null;
	revokeInviteCode(id: number, now: Date): void;
	/** 招待コードの一覧を、発行の新しい順に返す。createdBy を渡すと、その人が発行したものだけ */
	listInviteCodes(filter?: { createdBy?: string }): InviteCodeSummary[];
	/** since より後に、その人が発行した招待コードの数 (取り消したものも数える) */
	countInviteCodesSince(userId: string, since: Date): number;

	listPermissions(userId: string): Permission[];
	/** 権限を付ける (granted が true) か外す。付けた人と時刻を残す */
	setPermission(
		userId: string,
		permission: Permission,
		granted: boolean,
		grantedBy: string | null,
		now: Date,
	): void;
	/** 利用者の一覧を、メールアドレスの順に返す (管理画面の権限の設定に使う) */
	listUsers(): UserSummary[];
}

export interface InviteCodeSummary {
	readonly id: number;
	readonly note: string | null;
	readonly maxUses: number;
	readonly usedCount: number;
	readonly expiresAt: Date | null;
	readonly revoked: boolean;
	readonly createdAt: Date;
	readonly createdBy: string | null;
	readonly createdByEmail: string | null;
}

export interface UserSummary {
	readonly id: string;
	readonly email: string;
	readonly role: UserRole;
	readonly status: 'active' | 'suspended';
	readonly permissions: readonly Permission[];
}

type UserRow = typeof users.$inferSelect;

const toUser = (row: UserRow): AuthUser => ({
	id: row.id,
	email: row.email,
	name: row.name,
	role: row.role,
	status: row.status,
	termsAcceptedVersion: row.termsAcceptedVersion,
});

/** 推測できない乱数の ID */
const newUserId = () => randomBytes(16).toString('base64url');

export function createAuthStore(database: Database): AuthStore {
	const { db, sqlite } = database;

	const insertUser = (
		user: NewUser,
		now: Date,
		invite: { inviteCodeId: number | null },
	): string => {
		const id = newUserId();
		let invitedBy: string | null = null;
		if (invite.inviteCodeId !== null) {
			invitedBy =
				db
					.select({ createdBy: inviteCodes.createdBy })
					.from(inviteCodes)
					.where(eq(inviteCodes.id, invite.inviteCodeId))
					.get()?.createdBy ?? null;
		}
		db.insert(users)
			.values({
				id,
				email: user.email,
				googleSub: user.googleSub,
				name: user.name,
				role: user.role,
				createdAt: now,
				lastLoginAt: now,
				invitedBy,
				inviteCodeId: invite.inviteCodeId,
			})
			.run();
		return id;
	};

	return {
		findUserBySub(googleSub) {
			const row = db.select().from(users).where(eq(users.googleSub, googleSub)).get();
			return row ? toUser(row) : null;
		},
		findUserById(id) {
			const row = db.select().from(users).where(eq(users.id, id)).get();
			return row ? toUser(row) : null;
		},
		findUserByEmail(email) {
			const row = db
				.select()
				.from(users)
				.where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
				.get();
			return row ? toUser(row) : null;
		},
		createUser: (user, now) => insertUser(user, now, { inviteCodeId: null }),
		registerUser(user, invite, now) {
			return sqlite.transaction((): RegisterResult => {
				if (invite.inviteCodeId !== null) {
					// 使用回数の上限を、更新の条件に入れる。同時に 2 人が使っても、上限を超えない
					const changed = db
						.update(inviteCodes)
						.set({ usedCount: sql`${inviteCodes.usedCount} + 1` })
						.where(
							and(
								eq(inviteCodes.id, invite.inviteCodeId),
								isNull(inviteCodes.revokedAt),
								sql`${inviteCodes.usedCount} < ${inviteCodes.maxUses}`,
								sql`(${inviteCodes.expiresAt} IS NULL OR ${inviteCodes.expiresAt} > ${now.getTime()})`,
							),
						)
						.run().changes;
					if (changed === 0) return { kind: 'invite-unavailable' };
				}
				return { kind: 'created', userId: insertUser(user, now, invite) };
			})();
		},
		recordLogin(userId, now, update = {}) {
			db.update(users)
				.set({
					lastLoginAt: now,
					...(update.name !== undefined && { name: update.name }),
					...(update.role !== undefined && { role: update.role }),
				})
				.where(eq(users.id, userId))
				.run();
		},
		setRole(userId, role) {
			db.update(users).set({ role }).where(eq(users.id, userId)).run();
		},
		acceptTerms(userId, version, now) {
			sqlite.transaction(() => {
				db.update(users)
					.set({ termsAcceptedVersion: version, termsAcceptedAt: now })
					.where(eq(users.id, userId))
					.run();
				db.insert(termsAcceptances)
					.values({ userId, version, acceptedAt: now })
					.onConflictDoNothing()
					.run();
			})();
		},
		setStatus(userId, status) {
			sqlite.transaction(() => {
				db.update(users).set({ status }).where(eq(users.id, userId)).run();
				if (status === 'suspended') db.delete(sessions).where(eq(sessions.userId, userId)).run();
			})();
		},

		createSession(userId, now) {
			const token = generateToken();
			db.insert(sessions)
				.values({
					idHash: hashToken(token),
					userId,
					expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
					createdAt: now,
					lastUsedAt: now,
				})
				.run();
			return token;
		},
		resolveSession(token, now) {
			if (!token) return null;
			const idHash = hashToken(token);
			const session = db.select().from(sessions).where(eq(sessions.idHash, idHash)).get();
			if (!session || session.expiresAt.getTime() <= now.getTime()) return null;
			const user = db.select().from(users).where(eq(users.id, session.userId)).get();
			if (!user || user.status !== 'active') return null;
			// 使われるたびに有効期限を延ばす
			db.update(sessions)
				.set({ expiresAt: new Date(now.getTime() + SESSION_TTL_MS), lastUsedAt: now })
				.where(eq(sessions.idHash, idHash))
				.run();
			return toUser(user);
		},
		deleteSession(token) {
			db.delete(sessions)
				.where(eq(sessions.idHash, hashToken(token)))
				.run();
		},
		purgeExpiredSessions(now) {
			return db.delete(sessions).where(lt(sessions.expiresAt, now)).run().changes;
		},

		createInviteCode(options, now) {
			// 人が読み上げたり打ち直したりしやすいよう、セッションの ID より短くする
			const code = randomBytes(16).toString('base64url');
			db.insert(inviteCodes)
				.values({
					codeHash: hashToken(code),
					maxUses: options.maxUses,
					expiresAt: options.expiresAt ?? null,
					note: options.note ?? null,
					createdBy: options.createdBy ?? null,
					createdAt: now,
				})
				.run();
			return code;
		},
		findInviteCode(code) {
			if (!code) return null;
			const row = db
				.select()
				.from(inviteCodes)
				.where(eq(inviteCodes.codeHash, hashToken(code)))
				.get();
			return row
				? {
						id: row.id,
						maxUses: row.maxUses,
						usedCount: row.usedCount,
						expiresAt: row.expiresAt,
						revoked: row.revokedAt !== null,
					}
				: null;
		},
		listInviteCodes(filter) {
			return db
				.select({
					id: inviteCodes.id,
					note: inviteCodes.note,
					maxUses: inviteCodes.maxUses,
					usedCount: inviteCodes.usedCount,
					expiresAt: inviteCodes.expiresAt,
					revokedAt: inviteCodes.revokedAt,
					createdAt: inviteCodes.createdAt,
					createdBy: inviteCodes.createdBy,
					createdByEmail: users.email,
				})
				.from(inviteCodes)
				.leftJoin(users, eq(users.id, inviteCodes.createdBy))
				.where(filter?.createdBy ? eq(inviteCodes.createdBy, filter.createdBy) : undefined)
				.orderBy(desc(inviteCodes.createdAt), desc(inviteCodes.id))
				.all()
				.map(({ revokedAt, ...row }) => ({ ...row, revoked: revokedAt !== null }));
		},
		countInviteCodesSince(userId, since) {
			return (
				db
					.select({ count: sql<number>`count(*)` })
					.from(inviteCodes)
					.where(and(eq(inviteCodes.createdBy, userId), gt(inviteCodes.createdAt, since)))
					.get()?.count ?? 0
			);
		},
		listPermissions(userId) {
			return db
				.select({ permission: userPermissions.permission })
				.from(userPermissions)
				.where(eq(userPermissions.userId, userId))
				.all()
				.map((row) => row.permission);
		},
		setPermission(userId, permission, granted, grantedBy, now) {
			if (granted) {
				db.insert(userPermissions)
					.values({ userId, permission, grantedBy, grantedAt: now })
					.onConflictDoNothing()
					.run();
			} else {
				db.delete(userPermissions)
					.where(
						and(eq(userPermissions.userId, userId), eq(userPermissions.permission, permission)),
					)
					.run();
			}
		},
		listUsers() {
			const permissions = db.select().from(userPermissions).all();
			return db
				.select({ id: users.id, email: users.email, role: users.role, status: users.status })
				.from(users)
				.orderBy(users.email)
				.all()
				.map((user) => ({
					...user,
					permissions: permissions
						.filter((row) => row.userId === user.id)
						.map((row) => row.permission),
				}));
		},
		revokeInviteCode(id, now) {
			db.update(inviteCodes).set({ revokedAt: now }).where(eq(inviteCodes.id, id)).run();
		},
	};
}
