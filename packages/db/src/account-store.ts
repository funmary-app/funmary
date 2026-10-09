// アカウントのデータの書き出しと、退会。書き出しには、秘密 (トークン、暗号化した URL や鍵) を入れない。
// 退会は、利用者の行を消すだけで、持ち物は外部キーの cascade でまとめて消える (set null のものは、持ち主の記録だけが外れる)。
import { and, eq } from 'drizzle-orm';
import type { Database } from './database.ts';
import {
	absences,
	accessTokens,
	channels,
	courseRegistrations,
	dailyDigestSettings,
	discordLinks,
	eventSubscriptions,
	feedTokens,
	notifications,
	personalTimetableSlots,
	subjectAbbreviations,
	subjects,
	termsAcceptances,
	userEvents,
	users,
} from './schema.ts';

export interface AccountExport {
	readonly exportedAt: string;
	readonly account: {
		readonly email: string;
		readonly name: string | null;
		readonly role: string;
		readonly createdAt: string;
		readonly lastLoginAt: string | null;
	};
	readonly termsAcceptances: readonly { version: string; acceptedAt: string }[];
	readonly courseRegistrations: readonly {
		academicYear: number;
		syllabusId: string;
		subjectName: string;
		absenceLimit: number | null;
	}[];
	readonly personalTimetableSlots: readonly {
		syllabusId: string;
		weekday: number;
		period: number;
		room: string | null;
	}[];
	readonly events: readonly Record<string, unknown>[];
	readonly eventSubscriptions: readonly { eventId: number }[];
	readonly subjectAbbreviations: readonly { syllabusId: string; abbreviation: string }[];
	readonly absences: readonly { syllabusId: string; date: string; period: number }[];
	readonly notifications: readonly Record<string, unknown>[];
	readonly accessTokens: readonly Record<string, unknown>[];
	readonly subscriptions: readonly Record<string, unknown>[];
	readonly channels: readonly Record<string, unknown>[];
	readonly discordLink: { linkedAt: string } | null;
	readonly dailyDigest: Record<string, unknown> | null;
}

export interface AccountStore {
	/** 利用者のデータを、人が読める形にまとめる。いない利用者は null */
	exportData(userId: string, now: Date): AccountExport | null;
	/**
	 * 退会する。利用者の行と、持ち物 (履修、予定、通知、トークン、Discord 連携など) をすべて消す。
	 * 自分だけが見られる足した科目も消す。公開した科目と、監査記録は残し、持ち主の記録だけを外す。消したら true
	 */
	deleteAccount(userId: string): boolean;
}

const iso = (date: Date | null) => (date ? date.toISOString() : null);

export function createAccountStore(database: Database): AccountStore {
	const { db, sqlite } = database;

	return {
		exportData(userId, now) {
			const user = db.select().from(users).where(eq(users.id, userId)).get();
			if (!user) return null;
			const subjectOf = (id: number) => db.select().from(subjects).where(eq(subjects.id, id)).get();
			return {
				exportedAt: now.toISOString(),
				account: {
					email: user.email,
					name: user.name,
					role: user.role,
					createdAt: user.createdAt.toISOString(),
					lastLoginAt: iso(user.lastLoginAt),
				},
				termsAcceptances: db
					.select()
					.from(termsAcceptances)
					.where(eq(termsAcceptances.userId, userId))
					.all()
					.map((row) => ({ version: row.version, acceptedAt: row.acceptedAt.toISOString() })),
				courseRegistrations: db
					.select()
					.from(courseRegistrations)
					.where(eq(courseRegistrations.userId, userId))
					.all()
					.flatMap((row) => {
						const subject = subjectOf(row.subjectId);
						return subject
							? [
									{
										academicYear: subject.academicYear,
										syllabusId: subject.syllabusId,
										subjectName: subject.name,
										absenceLimit: row.absenceLimit,
									},
								]
							: [];
					}),
				personalTimetableSlots: db
					.select()
					.from(personalTimetableSlots)
					.where(eq(personalTimetableSlots.userId, userId))
					.all()
					.map((row) => ({
						syllabusId: subjectOf(row.subjectId)?.syllabusId ?? '',
						weekday: row.weekday,
						period: row.period,
						room: row.room,
					})),
				events: db
					.select()
					.from(userEvents)
					.where(eq(userEvents.ownerId, userId))
					.all()
					.map((row) => ({
						id: row.id,
						title: row.title,
						location: row.location,
						notes: row.notes,
						startDate: row.startDate,
						endDate: row.endDate,
						timeKind: row.timeKind,
						startTime: row.startTime,
						endTime: row.endTime,
						rrule: row.rrule,
						visibility: row.visibility,
					})),
				eventSubscriptions: db
					.select()
					.from(eventSubscriptions)
					.where(eq(eventSubscriptions.userId, userId))
					.all()
					.map((row) => ({ eventId: row.eventId })),
				subjectAbbreviations: db
					.select()
					.from(subjectAbbreviations)
					.where(eq(subjectAbbreviations.userId, userId))
					.all()
					.map((row) => ({
						syllabusId: subjectOf(row.subjectId)?.syllabusId ?? '',
						abbreviation: row.abbreviation,
					})),
				absences: db
					.select()
					.from(absences)
					.where(eq(absences.userId, userId))
					.all()
					.map((row) => ({
						syllabusId: subjectOf(row.subjectId)?.syllabusId ?? '',
						date: row.date,
						period: row.period,
					})),
				notifications: db
					.select()
					.from(notifications)
					.where(eq(notifications.userId, userId))
					.all()
					.map((row) => ({
						kind: row.kind,
						title: row.title,
						body: row.body,
						link: row.link,
						date: row.date,
						createdAt: row.createdAt.toISOString(),
					})),
				accessTokens: db
					.select()
					.from(accessTokens)
					.where(eq(accessTokens.userId, userId))
					.all()
					.map((row) => ({
						name: row.name,
						scopes: row.scopes,
						createdAt: row.createdAt.toISOString(),
						expiresAt: row.expiresAt.toISOString(),
						lastUsedAt: iso(row.lastUsedAt),
						revoked: row.revokedAt !== null,
					})),
				subscriptions: db
					.select()
					.from(feedTokens)
					.where(eq(feedTokens.userId, userId))
					.all()
					.map((row) => ({
						kind: row.kind,
						createdAt: row.createdAt.toISOString(),
						lastUsedAt: iso(row.lastUsedAt),
						revoked: row.revokedAt !== null,
					})),
				channels: db
					.select()
					.from(channels)
					.where(eq(channels.userId, userId))
					.all()
					.map((row) => ({ kind: row.kind, label: row.label, status: row.status })),
				discordLink: (() => {
					const link = db.select().from(discordLinks).where(eq(discordLinks.userId, userId)).get();
					return link ? { linkedAt: link.createdAt.toISOString() } : null;
				})(),
				dailyDigest: (() => {
					const row = db
						.select()
						.from(dailyDigestSettings)
						.where(eq(dailyDigestSettings.userId, userId))
						.get();
					if (!row) return null;
					return {
						enabled: row.enabled,
						timing: row.timing,
						customTime: row.customTime,
						customDay: row.customDay,
						sendWhenEmpty: row.sendWhenEmpty,
					};
				})(),
			};
		},
		deleteAccount(userId) {
			return sqlite.transaction(() => {
				db.delete(subjects)
					.where(
						and(
							eq(subjects.source, 'user'),
							eq(subjects.createdBy, userId),
							eq(subjects.visibility, 'private'),
						),
					)
					.run();
				return db.delete(users).where(eq(users.id, userId)).run().changes > 0;
			})();
		},
	};
}
