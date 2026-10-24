// 利用者の通知欄。通知はまずここに入り、送り先 (Discord など) へは送信待ちを経て送る。
// 同じ出来事は、dedupeKey で利用者ごとに 1 回だけ足す
import { and, desc, eq, gte, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { Database } from './database.ts';
import { classChanges, courseRegistrations, notifications, subjects } from './schema.ts';

/** 通知の種類。cancellation、makeup、roomChange は休講、補講、教室変更、integration は連携の不具合、notice はお知らせ */
/** termStart は、前期か後期の始まりに、その学期の履修登録を促すもの */
export type NotificationKind =
	'cancellation' | 'makeup' | 'roomChange' | 'integration' | 'notice' | 'termStart';

export interface NewNotification {
	readonly userId: string;
	readonly kind: NotificationKind;
	readonly title: string;
	readonly body: string | null;
	/** 押したときに開く画面のパス */
	readonly link: string | null;
	readonly subjectId: number | null;
	/** 授業の日付 (YYYY-MM-DD)。休講などの通知のときだけ持つ。省くと null */
	readonly date?: string | null;
	/** 授業の時限。休講などの通知のときだけ持つ。省くと null */
	readonly period?: number | null;
	readonly dedupeKey: string | null;
}

export interface StoredNotification extends Omit<NewNotification, 'userId' | 'date' | 'period'> {
	readonly id: number;
	readonly date: string | null;
	readonly period: number | null;
	readonly createdAt: Date;
	readonly readAt: Date | null;
}

export interface ClassChangeCandidate {
	readonly userId: string;
	readonly classChangeId: number;
	readonly kind: 'cancellation' | 'makeup' | 'roomChange';
	readonly date: string;
	readonly period: number;
	readonly room: string | null;
	readonly fromRoom: string | null;
	readonly subjectId: number;
	readonly subjectName: string;
	readonly academicYear: number;
	readonly syllabusId: string;
}

export interface NotificationStore {
	/** 足した通知の ID を返す。同じ利用者に同じ dedupeKey の通知があれば、足さない */
	insertMany(entries: readonly NewNotification[], now: Date): number[];
	/** 新しい順。kind で絞れる */
	list(userId: string, options: { limit: number; kind?: NotificationKind }): StoredNotification[];
	unreadCount(userId: string): number;
	/** その人の通知なら既読にして返す。ほかの人の通知や、無い通知は null */
	markRead(userId: string, id: number, now: Date): StoredNotification | null;
	markAllRead(userId: string, now: Date): number;
	pruneBefore(before: Date): number;
	/**
	 * 通知する休講、補講、教室変更の候補。履修している人ごとに、today 以降で、取り消されておらず、
	 * 履修したあとに見つけたもの (履修した時点で既にあったものは、通知欄に流さない)
	 */
	classChangeCandidates(today: string): ClassChangeCandidate[];
}

type Row = typeof notifications.$inferSelect;

const toNotification = (row: Row): StoredNotification => ({
	id: row.id,
	kind: row.kind as NotificationKind,
	title: row.title,
	body: row.body,
	link: row.link,
	subjectId: row.subjectId,
	date: row.date,
	period: row.period,
	dedupeKey: row.dedupeKey,
	createdAt: row.createdAt,
	readAt: row.readAt,
});

export function createNotificationStore(database: Database): NotificationStore {
	const { db, sqlite } = database;
	return {
		insertMany(entries, now) {
			return sqlite.transaction(() =>
				entries.flatMap((entry) =>
					db
						.insert(notifications)
						.values({ ...entry, createdAt: now })
						.onConflictDoNothing()
						.returning({ id: notifications.id })
						.all()
						.map((row) => row.id),
				),
			)();
		},
		list(userId, { limit, kind }) {
			return db
				.select()
				.from(notifications)
				.where(
					and(eq(notifications.userId, userId), kind ? eq(notifications.kind, kind) : undefined),
				)
				.orderBy(desc(notifications.createdAt), desc(notifications.id))
				.limit(limit)
				.all()
				.map(toNotification);
		},
		unreadCount(userId) {
			return (
				db
					.select({ count: sql<number>`count(*)` })
					.from(notifications)
					.where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
					.get()?.count ?? 0
			);
		},
		markRead(userId, id, now) {
			const row = db
				.select()
				.from(notifications)
				.where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
				.get();
			if (!row) return null;
			if (row.readAt === null) {
				db.update(notifications).set({ readAt: now }).where(eq(notifications.id, id)).run();
			}
			return toNotification({ ...row, readAt: row.readAt ?? now });
		},
		markAllRead(userId, now) {
			return db
				.update(notifications)
				.set({ readAt: now })
				.where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
				.run().changes;
		},
		pruneBefore(before) {
			return db.delete(notifications).where(lt(notifications.createdAt, before)).run().changes;
		},
		classChangeCandidates(today) {
			return db
				.select({
					userId: courseRegistrations.userId,
					classChangeId: classChanges.id,
					kind: classChanges.kind,
					date: classChanges.date,
					period: classChanges.period,
					room: classChanges.room,
					fromRoom: classChanges.fromRoom,
					subjectId: subjects.id,
					subjectName: subjects.name,
					academicYear: subjects.academicYear,
					syllabusId: subjects.syllabusId,
				})
				.from(classChanges)
				.innerJoin(subjects, eq(subjects.id, classChanges.subjectId))
				.innerJoin(courseRegistrations, eq(courseRegistrations.subjectId, classChanges.subjectId))
				.where(
					and(
						isNotNull(classChanges.subjectId),
						isNull(classChanges.withdrawnAt),
						gte(classChanges.date, today),
						gte(classChanges.firstSeenAt, courseRegistrations.createdAt),
					),
				)
				.orderBy(classChanges.date, classChanges.period, courseRegistrations.userId)
				.all();
		},
	};
}
