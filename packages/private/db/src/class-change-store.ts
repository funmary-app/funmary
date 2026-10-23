// 休講、補講、教室変更の、前回までの記録。@funmary/core の detectChanges の入出力を保存する。
// 科目との照合 (subject_id) は、apply では変えず、照合のあとに assignSubject で入れる。
import type { ScrapedChange, TrackedChange } from '@funmary/core';
import { and, asc, between, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Database } from './database.ts';
import { classChanges } from './schema.ts';

export interface ClassChangeStore {
	/** 記録されている全件 */
	load(): TrackedChange[];
	/**
	 * detectChanges の next を保存する。1 つのトランザクションで行う。
	 * next に載っていない記録は消さない (過去の日付のものを残す)。
	 * 最初に見た時刻は変えず、最後に見た時刻は、一覧に載っていた (missingCount が 0 の) ときだけ更新する
	 */
	apply(next: readonly TrackedChange[], now: Date): void;
	withdrawnAt(change: ScrapedChange): Date | null;
	seenAt(change: ScrapedChange): { firstSeenAt: Date; lastSeenAt: Date } | null;
	/** 科目と照合できた休講などを、日付の新しい順に返す (授業の詳細の履歴に使う) */
	listBySubject(subjectId: number): SubjectClassChange[];
	/**
	 * start から end まで (両端を含む) の、科目と照合できた休講などを、日付と時限の順に返す (時間割の展開に使う)。
	 * 取り消されたものは除く
	 */
	listAssignedBetween(start: string, end: string): AssignedClassChange[];
	/**
	 * start から end まで (両端を含む) の休講などを、科目が決まっていないものも含めて、日付と時限の順に返す
	 * (休講などの一覧の画面に使う)。取り消されたものは除く
	 */
	listBetween(start: string, end: string): ListedClassChange[];
	/** まだ科目が決まっていない授業名を、重なりなく名前の順に返す */
	unassignedLessonNames(): string[];
	/** 科目が決まっていない、その授業名の行に科目を入れ、変えた行の数を返す。決まっている行は変えない */
	assignSubject(lessonName: string, subjectId: number): number;
	/** その授業名の行から科目を外し、外した行の数を返す (紐付けを直すときに使う) */
	unassignSubject(lessonName: string): number;
}

export interface SubjectClassChange {
	readonly kind: TrackedChange['kind'];
	readonly date: string;
	readonly period: number;
	/** 補講の教室、または教室変更の移動先 */
	readonly room: string | null;
	readonly fromRoom: string | null;
	readonly comment: string | null;
	readonly makeupPlan: TrackedChange['makeupPlan'];
	/** ポータルの一覧から消え、取り消されたとみなしたもの */
	readonly withdrawn: boolean;
}

export interface AssignedClassChange {
	readonly kind: TrackedChange['kind'];
	readonly subjectId: number;
	readonly date: string;
	readonly period: number;
	/** 補講の教室、または教室変更の移動先 */
	readonly room: string | null;
	/** 教室変更の移動元 */
	readonly fromRoom: string | null;
	/** ポータルの休講などのコメント */
	readonly comment: string | null;
	readonly makeupPlan: TrackedChange['makeupPlan'];
}

export interface ListedClassChange extends Omit<AssignedClassChange, 'subjectId'> {
	/** 照合できた科目。まだ決まっていなければ null */
	readonly subjectId: number | null;
	/** ポータルの表記のままの授業名 */
	readonly lessonName: string;
}

type Row = typeof classChanges.$inferSelect;

function toTracked(row: Row): TrackedChange {
	return {
		kind: row.kind,
		date: row.date,
		period: row.period,
		lessonName: row.lessonName,
		teacher: row.teacher,
		campus: row.campus,
		room: row.room,
		fromRoom: row.fromRoom,
		comment: row.comment,
		makeupPlan: row.makeupPlan,
		missingCount: row.missingCount,
		withdrawn: row.withdrawnAt !== null,
	};
}

const sameKey = (change: ScrapedChange) =>
	and(
		eq(classChanges.kind, change.kind),
		eq(classChanges.date, change.date),
		eq(classChanges.period, change.period),
		eq(classChanges.lessonName, change.lessonName),
	);

export function createClassChangeStore(database: Database): ClassChangeStore {
	const { db, sqlite } = database;
	return {
		load() {
			return db
				.select()
				.from(classChanges)
				.orderBy(classChanges.date, classChanges.period, classChanges.id)
				.all()
				.map(toTracked);
		},
		apply(next, now) {
			sqlite.transaction(() => {
				for (const change of next) {
					const existing = db.select().from(classChanges).where(sameKey(change)).get();
					const fields = {
						teacher: change.teacher,
						campus: change.campus,
						room: change.room,
						fromRoom: change.fromRoom,
						comment: change.comment,
						makeupPlan: change.makeupPlan,
						missingCount: change.missingCount,
					};
					if (!existing) {
						db.insert(classChanges)
							.values({
								kind: change.kind,
								date: change.date,
								period: change.period,
								lessonName: change.lessonName,
								...fields,
								firstSeenAt: now,
								lastSeenAt: now,
								withdrawnAt: change.withdrawn ? now : null,
							})
							.run();
						continue;
					}
					db.update(classChanges)
						.set({
							...fields,
							...(change.missingCount === 0 && { lastSeenAt: now }),
							// 取り消した時刻は、最初に取り消したときのものを残す
							withdrawnAt: change.withdrawn ? (existing.withdrawnAt ?? now) : null,
						})
						.where(eq(classChanges.id, existing.id))
						.run();
				}
			})();
		},
		withdrawnAt(change) {
			return db.select().from(classChanges).where(sameKey(change)).get()?.withdrawnAt ?? null;
		},
		seenAt(change) {
			const row = db.select().from(classChanges).where(sameKey(change)).get();
			return row ? { firstSeenAt: row.firstSeenAt, lastSeenAt: row.lastSeenAt } : null;
		},
		listBySubject(subjectId) {
			return db
				.select()
				.from(classChanges)
				.where(eq(classChanges.subjectId, subjectId))
				.orderBy(desc(classChanges.date), desc(classChanges.period), desc(classChanges.id))
				.all()
				.map((row) => ({
					kind: row.kind,
					date: row.date,
					period: row.period,
					room: row.room,
					fromRoom: row.fromRoom,
					comment: row.comment,
					makeupPlan: row.makeupPlan,
					withdrawn: row.withdrawnAt !== null,
				}));
		},
		listAssignedBetween(start, end) {
			return db
				.select({
					kind: classChanges.kind,
					subjectId: classChanges.subjectId,
					date: classChanges.date,
					period: classChanges.period,
					room: classChanges.room,
					fromRoom: classChanges.fromRoom,
					comment: classChanges.comment,
					makeupPlan: classChanges.makeupPlan,
				})
				.from(classChanges)
				.where(
					and(
						between(classChanges.date, start, end),
						isNotNull(classChanges.subjectId),
						isNull(classChanges.withdrawnAt),
					),
				)
				.orderBy(classChanges.date, classChanges.period, classChanges.id)
				.all()
				.flatMap(({ subjectId, ...rest }) => (subjectId === null ? [] : [{ ...rest, subjectId }]));
		},
		listBetween(start, end) {
			return db
				.select({
					kind: classChanges.kind,
					subjectId: classChanges.subjectId,
					lessonName: classChanges.lessonName,
					date: classChanges.date,
					period: classChanges.period,
					room: classChanges.room,
					fromRoom: classChanges.fromRoom,
					comment: classChanges.comment,
					makeupPlan: classChanges.makeupPlan,
				})
				.from(classChanges)
				.where(and(between(classChanges.date, start, end), isNull(classChanges.withdrawnAt)))
				.orderBy(classChanges.date, classChanges.period, classChanges.id)
				.all();
		},
		unassignedLessonNames() {
			return db
				.selectDistinct({ lessonName: classChanges.lessonName })
				.from(classChanges)
				.where(isNull(classChanges.subjectId))
				.orderBy(asc(classChanges.lessonName))
				.all()
				.map((row) => row.lessonName);
		},
		assignSubject(lessonName, subjectId) {
			return db
				.update(classChanges)
				.set({ subjectId })
				.where(and(eq(classChanges.lessonName, lessonName), isNull(classChanges.subjectId)))
				.run().changes;
		},
		unassignSubject(lessonName) {
			return db
				.update(classChanges)
				.set({ subjectId: null })
				.where(and(eq(classChanges.lessonName, lessonName), isNotNull(classChanges.subjectId)))
				.run().changes;
		},
	};
}
