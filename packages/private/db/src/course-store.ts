// 履修登録と、科目ごとの時間割の枠 (曜日、時限、教室) の保存。
// 枠は、大学から自動では取れないので、利用者どうしで登録して、同じ科目を取る全員で共有する。
// 既にある枠は上書きしない。教室が食い違えば、食い違いとして返し、管理者が確かめて直す。
import { and, asc, eq } from 'drizzle-orm';
import type { Database } from './database.ts';
import { courseRegistrations, subjects, timetableSlots } from './schema.ts';

/** 利用者のポータルの時間割から読んだ、1 つのコマ (検査を通ったもの) */
export interface PortalCell {
	readonly lessonId: string;
	readonly year: number;
	readonly weekday: number | null;
	readonly period: number | null;
	readonly room: string | null;
	readonly hopeUrl: string | null;
}

export interface SlotConflict {
	readonly subjectId: number;
	readonly weekday: number;
	readonly period: number;
	readonly existingRoom: string | null;
	readonly importedRoom: string | null;
}

export interface ImportResult {
	/** 新しく履修登録した科目の数 */
	readonly registered: number;
	readonly slotsAdded: number;
	/** 空だった教室を埋めた枠の数 */
	readonly slotsUpdated: number;
	/** まだ取り込んでいない科目 (公開シラバスにない、または取り込み前) */
	readonly unknown: readonly { lessonId: string; year: number }[];
	readonly conflicts: readonly SlotConflict[];
}

export interface StoredSlot {
	readonly weekday: number;
	readonly period: number;
	readonly room: string | null;
	readonly source: 'portal' | 'manual' | 'pdf' | 'admin';
	readonly createdBy: string | null;
}

export type SlotSource = StoredSlot['source'];

/** 科目ごとに共有する枠を 1 つ足すための値 */
export interface SharedSlotInput {
	readonly subjectId: number;
	readonly weekday: number;
	readonly period: number;
	readonly room: string | null;
}

export interface AddSlotsResult {
	readonly added: number;
	/** 空だった教室を埋めた枠の数 */
	readonly updated: number;
	readonly conflicts: readonly SlotConflict[];
}

export interface CourseStore {
	importFromPortal(userId: string, cells: readonly PortalCell[], now: Date): ImportResult;
	/** 科目ごとに共有する枠を足す。既にある枠は上書きせず、教室の食い違いを返す */
	addSharedSlots(
		slots: readonly SharedSlotInput[],
		origin: { readonly source: SlotSource; readonly createdBy: string | null },
		now: Date,
	): AddSlotsResult;
	/** 履修登録する。新しく登録したら true (登録済みなら、HOPE の URL などは変えずに false) */
	register(userId: string, subjectId: number, now: Date): boolean;
	/** 履修登録を取り消す。共有の枠は、ほかの利用者も使うので残す */
	unregister(userId: string, subjectId: number): boolean;
	isRegistered(userId: string, subjectId: number): boolean;
	listRegistrations(userId: string): { subjectId: number; hopeCourseUrl: string | null }[];
	slotsOf(subjectId: number): StoredSlot[];
	/** その曜日と時限に共有の枠を持つ科目の ID */
	subjectsAt(weekday: number, period: number): number[];
}

export function createCourseStore(database: Database): CourseStore {
	const { db, sqlite } = database;

	/** 枠を 1 つ足す。トランザクションの中で呼ぶ */
	function addSlot(
		slot: SharedSlotInput,
		source: SlotSource,
		createdBy: string | null,
		now: Date,
	): 'added' | 'updated' | 'unchanged' | SlotConflict {
		const existing = db
			.select()
			.from(timetableSlots)
			.where(
				and(
					eq(timetableSlots.subjectId, slot.subjectId),
					eq(timetableSlots.weekday, slot.weekday),
					eq(timetableSlots.period, slot.period),
				),
			)
			.get();
		if (!existing) {
			db.insert(timetableSlots)
				.values({
					subjectId: slot.subjectId,
					weekday: slot.weekday,
					period: slot.period,
					room: slot.room,
					source,
					createdBy,
					updatedAt: now,
				})
				.run();
			return 'added';
		}
		if (existing.room === null && slot.room !== null) {
			db.update(timetableSlots)
				.set({ room: slot.room, updatedAt: now })
				.where(eq(timetableSlots.id, existing.id))
				.run();
			return 'updated';
		}
		if (slot.room !== null && existing.room !== slot.room) {
			return {
				subjectId: slot.subjectId,
				weekday: slot.weekday,
				period: slot.period,
				existingRoom: existing.room,
				importedRoom: slot.room,
			};
		}
		return 'unchanged';
	}

	return {
		importFromPortal(userId, cells, now) {
			let registered = 0;
			let slotsAdded = 0;
			let slotsUpdated = 0;
			const unknown: { lessonId: string; year: number }[] = [];
			const conflicts: SlotConflict[] = [];

			sqlite.transaction(() => {
				for (const cell of cells) {
					const subject = db
						.select({ id: subjects.id })
						.from(subjects)
						.where(
							and(eq(subjects.academicYear, cell.year), eq(subjects.syllabusId, cell.lessonId)),
						)
						.get();
					if (!subject) {
						unknown.push({ lessonId: cell.lessonId, year: cell.year });
						continue;
					}

					const inserted = db
						.insert(courseRegistrations)
						.values({ userId, subjectId: subject.id, hopeCourseUrl: cell.hopeUrl, createdAt: now })
						.onConflictDoNothing()
						.run();
					if (inserted.changes > 0) registered++;
					else if (cell.hopeUrl) {
						// 既に登録済みなら、HOPE の URL が空のときだけ埋める (利用者が手で直した値は変えない)
						db.update(courseRegistrations)
							.set({ hopeCourseUrl: cell.hopeUrl })
							.where(
								and(
									eq(courseRegistrations.userId, userId),
									eq(courseRegistrations.subjectId, subject.id),
								),
							)
							.run();
					}

					if (cell.weekday === null || cell.period === null) continue;
					const outcome = addSlot(
						{ subjectId: subject.id, weekday: cell.weekday, period: cell.period, room: cell.room },
						'portal',
						userId,
						now,
					);
					if (outcome === 'added') slotsAdded++;
					else if (outcome === 'updated') slotsUpdated++;
					else if (outcome !== 'unchanged') conflicts.push(outcome);
				}
			})();
			return { registered, slotsAdded, slotsUpdated, unknown, conflicts };
		},

		addSharedSlots(slots, origin, now) {
			let added = 0;
			let updated = 0;
			const conflicts: SlotConflict[] = [];
			sqlite.transaction(() => {
				for (const slot of slots) {
					const outcome = addSlot(slot, origin.source, origin.createdBy, now);
					if (outcome === 'added') added++;
					else if (outcome === 'updated') updated++;
					else if (outcome !== 'unchanged') conflicts.push(outcome);
				}
			})();
			return { added, updated, conflicts };
		},

		register(userId, subjectId, now) {
			const inserted = db
				.insert(courseRegistrations)
				.values({ userId, subjectId, createdAt: now })
				.onConflictDoNothing()
				.run();
			return inserted.changes > 0;
		},

		unregister(userId, subjectId) {
			const deleted = db
				.delete(courseRegistrations)
				.where(
					and(eq(courseRegistrations.userId, userId), eq(courseRegistrations.subjectId, subjectId)),
				)
				.run();
			return deleted.changes > 0;
		},

		isRegistered(userId, subjectId) {
			const row = db
				.select({ subjectId: courseRegistrations.subjectId })
				.from(courseRegistrations)
				.where(
					and(eq(courseRegistrations.userId, userId), eq(courseRegistrations.subjectId, subjectId)),
				)
				.get();
			return row !== undefined;
		},

		listRegistrations(userId) {
			return db
				.select({
					subjectId: courseRegistrations.subjectId,
					hopeCourseUrl: courseRegistrations.hopeCourseUrl,
				})
				.from(courseRegistrations)
				.where(eq(courseRegistrations.userId, userId))
				.orderBy(asc(courseRegistrations.subjectId))
				.all();
		},

		slotsOf(subjectId) {
			return db
				.select({
					weekday: timetableSlots.weekday,
					period: timetableSlots.period,
					room: timetableSlots.room,
					source: timetableSlots.source,
					createdBy: timetableSlots.createdBy,
				})
				.from(timetableSlots)
				.where(eq(timetableSlots.subjectId, subjectId))
				.orderBy(asc(timetableSlots.weekday), asc(timetableSlots.period))
				.all();
		},

		subjectsAt(weekday, period) {
			return db
				.select({ subjectId: timetableSlots.subjectId })
				.from(timetableSlots)
				.where(and(eq(timetableSlots.weekday, weekday), eq(timetableSlots.period, period)))
				.orderBy(asc(timetableSlots.subjectId))
				.all()
				.map((row) => row.subjectId);
		},
	};
}
