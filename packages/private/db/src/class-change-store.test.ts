import { detectChanges, type ScrapedChange } from '@funmary/core';
import { describe, expect, it } from 'vitest';
import { createClassChangeStore } from './class-change-store.ts';
import type { Database } from './database.ts';
import { createSubjectStore } from './subject-store.ts';
import { useTestDatabase } from './testing.ts';

let database: Database;
useTestDatabase('funmary-changes-', (db) => (database = db));

const item = (over: Partial<ScrapedChange> = {}): ScrapedChange => ({
	kind: 'roomChange',
	date: '2026-10-05',
	period: 3,
	lessonName: '線形代数 I',
	teacher: '山田 太郎',
	campus: '亀田',
	room: '502',
	fromRoom: '401',
	comment: null,
	makeupPlan: null,
	...over,
});

const t1 = new Date('2026-10-01T00:00:00Z');
const t2 = new Date('2026-10-02T00:00:00Z');
const t3 = new Date('2026-10-03T00:00:00Z');

describe('createClassChangeStore', () => {
	it('まだ何もなければ空で返す', () => {
		expect(createClassChangeStore(database).load()).toEqual([]);
	});

	it('取得した内容を保存し、そのまま読み戻せる', () => {
		const store = createClassChangeStore(database);
		const result = detectChanges({ previous: [], scraped: [item()], today: '2026-10-01' });
		if (result.kind !== 'ok') throw new Error('ok のはず');
		store.apply(result.next, t1);
		expect(store.load()).toEqual([{ ...item(), missingCount: 0, withdrawn: false }]);
	});

	it('保存し直すと、同じ項目は上書きし、新しい項目は増える。全件の入れ替えで消えた項目も残す', () => {
		const store = createClassChangeStore(database);
		const first = detectChanges({
			previous: [],
			scraped: [item(), item({ period: 4 })],
			today: '2026-10-01',
		});
		if (first.kind !== 'ok') throw new Error('ok のはず');
		store.apply(first.next, t1);

		// 1 回目の取得で period 4 が消え、period 3 の教室が変わり、period 5 が増えた
		const second = detectChanges({
			previous: store.load(),
			scraped: [item({ room: '601' }), item({ period: 5 })],
			today: '2026-10-01',
		});
		if (second.kind !== 'ok') throw new Error('ok のはず');
		store.apply(second.next, t2);

		const rows = store.load();
		expect(rows.map((r) => [r.period, r.room, r.missingCount])).toEqual([
			[3, '601', 0],
			[4, '502', 1],
			[5, '502', 0],
		]);
	});

	it('取り消しは、取り消した時刻を残す。載り直したら、取り消しを解く', () => {
		const store = createClassChangeStore(database);
		const base = { ...item(), missingCount: 1, withdrawn: false };
		store.apply([base], t1);
		store.apply([{ ...base, missingCount: 2, withdrawn: true }], t2);
		expect(store.load()[0]).toMatchObject({ withdrawn: true, missingCount: 2 });
		expect(store.withdrawnAt(base)).toEqual(t2);

		// 取り消し済みのまま保存し直しても、取り消した時刻は変わらない
		store.apply([{ ...base, missingCount: 2, withdrawn: true }], t3);
		expect(store.withdrawnAt(base)).toEqual(t2);

		store.apply([{ ...item(), missingCount: 0, withdrawn: false }], t3);
		expect(store.load()[0]).toMatchObject({ withdrawn: false, missingCount: 0 });
		expect(store.withdrawnAt(base)).toBeNull();
	});

	it('最初に見た時刻は変えず、最後に見た時刻は一覧に載っていたときだけ更新する', () => {
		const store = createClassChangeStore(database);
		store.apply([{ ...item(), missingCount: 0, withdrawn: false }], t1);
		store.apply([{ ...item(), missingCount: 0, withdrawn: false }], t2);
		store.apply([{ ...item(), missingCount: 1, withdrawn: false }], t3);
		expect(store.seenAt(item())).toEqual({ firstSeenAt: t1, lastSeenAt: t2 });
	});
});

describe('listBySubject', () => {
	it('科目と照合できた休講などを、日付の新しい順に返す。取り消されたものには印を付ける', () => {
		const subjectId = createSubjectStore(database).upsert(
			{
				academicYear: 2026,
				syllabusId: '100001',
				name: '線形代数 I',
				teacher: null,
				credits: 2,
				term: 'fall',
				attributes: {},
				syllabus: {},
				syllabusUrl: null,
			},
			t1,
		);
		const store = createClassChangeStore(database);
		const result = detectChanges({
			previous: [],
			scraped: [
				item(),
				item({ kind: 'cancellation', date: '2026-10-12', room: null, fromRoom: null }),
				item({ lessonName: 'ほかの科目' }),
			],
			today: '2026-10-01',
		});
		if (result.kind !== 'ok') throw new Error('ok のはず');
		store.apply(result.next, t1);
		database.sqlite
			.prepare("UPDATE class_changes SET subject_id = ? WHERE lesson_name = '線形代数 I'")
			.run(subjectId);
		database.sqlite
			.prepare("UPDATE class_changes SET withdrawn_at = 1 WHERE kind = 'cancellation'")
			.run();

		expect(store.listBySubject(subjectId)).toEqual([
			{
				kind: 'cancellation',
				date: '2026-10-12',
				period: 3,
				room: null,
				fromRoom: null,
				comment: null,
				makeupPlan: null,
				withdrawn: true,
			},
			{
				kind: 'roomChange',
				date: '2026-10-05',
				period: 3,
				room: '502',
				fromRoom: '401',
				comment: null,
				makeupPlan: null,
				withdrawn: false,
			},
		]);
	});
});

describe('unassignedLessonNames と assignSubject', () => {
	it('科目が決まっていない授業名を返し、授業名ごとに科目を割り当てる。割り当て済みは変えない', () => {
		const subjects = createSubjectStore(database);
		const base = {
			academicYear: 2026,
			teacher: null,
			credits: 2,
			term: 'fall',
			attributes: {},
			syllabus: {},
			syllabusUrl: null,
		};
		const first = subjects.upsert({ ...base, syllabusId: '100001', name: '線形代数 I' }, t1);
		const second = subjects.upsert({ ...base, syllabusId: '100002', name: '別の科目' }, t1);
		const store = createClassChangeStore(database);
		const result = detectChanges({
			previous: [],
			scraped: [item(), item({ period: 4 }), item({ lessonName: 'ほかの科目' })],
			today: '2026-10-01',
		});
		if (result.kind !== 'ok') throw new Error('ok のはず');
		store.apply(result.next, t1);

		expect(store.unassignedLessonNames()).toEqual(['ほかの科目', '線形代数 I']);
		expect(store.assignSubject('線形代数 I', first)).toBe(2);
		expect(store.unassignedLessonNames()).toEqual(['ほかの科目']);
		expect(store.assignSubject('線形代数 I', second)).toBe(0);
		expect(store.listBySubject(first)).toHaveLength(2);
	});
});

describe('unassignSubject', () => {
	it('その授業名の行から科目を外し、外した行の数を返す。ほかの授業名は変えない', () => {
		const subjectId = createSubjectStore(database).upsert(
			{
				academicYear: 2026,
				syllabusId: '100001',
				name: '線形代数 I',
				teacher: null,
				credits: 2,
				term: 'fall',
				attributes: {},
				syllabus: {},
				syllabusUrl: null,
			},
			t1,
		);
		const store = createClassChangeStore(database);
		const result = detectChanges({
			previous: [],
			scraped: [item(), item({ period: 4 }), item({ lessonName: 'ほかの科目' })],
			today: '2026-10-01',
		});
		if (result.kind !== 'ok') throw new Error('ok のはず');
		store.apply(result.next, t1);
		store.assignSubject('線形代数 I', subjectId);
		store.assignSubject('ほかの科目', subjectId);

		expect(store.unassignSubject('線形代数 I')).toBe(2);
		expect(store.unassignedLessonNames()).toEqual(['線形代数 I']);
		expect(store.listBySubject(subjectId)).toHaveLength(1);
	});
});

describe('listAssignedBetween', () => {
	it('期間内の、科目と照合できた休講などを返す。取り消されたものと、科目が決まっていないものは除く', () => {
		const subjectId = createSubjectStore(database).upsert(
			{
				academicYear: 2026,
				syllabusId: '100001',
				name: '線形代数 I',
				teacher: null,
				credits: 2,
				term: 'fall',
				attributes: {},
				syllabus: {},
				syllabusUrl: null,
			},
			t1,
		);
		const store = createClassChangeStore(database);
		const result = detectChanges({
			previous: [],
			scraped: [
				item(),
				item({ kind: 'makeup', date: '2026-10-07', period: 5, room: null, fromRoom: null }),
				item({ kind: 'cancellation', date: '2026-10-08', room: null, fromRoom: null }),
				item({ date: '2026-10-20' }),
				item({ lessonName: 'ほかの科目' }),
			],
			today: '2026-10-01',
		});
		if (result.kind !== 'ok') throw new Error('ok のはず');
		store.apply(result.next, t1);
		database.sqlite
			.prepare("UPDATE class_changes SET subject_id = ? WHERE lesson_name = '線形代数 I'")
			.run(subjectId);
		database.sqlite
			.prepare("UPDATE class_changes SET withdrawn_at = 1 WHERE kind = 'cancellation'")
			.run();

		expect(store.listAssignedBetween('2026-10-05', '2026-10-11')).toMatchObject([
			{ kind: 'roomChange', subjectId, date: '2026-10-05', period: 3, room: '502' },
			{ kind: 'makeup', subjectId, date: '2026-10-07', period: 5, room: null },
		]);
	});
});

describe('listBetween', () => {
	it('期間内の休講などを、科目が決まっていないものも含めて、日付と時限の順に返す。取り消されたものは除く', () => {
		const subjectId = createSubjectStore(database).upsert(
			{
				academicYear: 2026,
				syllabusId: '100001',
				name: '線形代数 I',
				teacher: null,
				credits: 2,
				term: 'fall',
				attributes: {},
				syllabus: {},
				syllabusUrl: null,
			},
			t1,
		);
		const store = createClassChangeStore(database);
		const result = detectChanges({
			previous: [],
			scraped: [
				item({ date: '2026-10-06', lessonName: 'ほかの科目', comment: '教員の都合' }),
				item(),
				item({ kind: 'cancellation', date: '2026-10-08', room: null, fromRoom: null }),
				item({ date: '2026-10-20' }),
			],
			today: '2026-10-01',
		});
		if (result.kind !== 'ok') throw new Error('ok のはず');
		store.apply(result.next, t1);
		database.sqlite
			.prepare("UPDATE class_changes SET subject_id = ? WHERE lesson_name = '線形代数 I'")
			.run(subjectId);
		database.sqlite
			.prepare("UPDATE class_changes SET withdrawn_at = 1 WHERE kind = 'cancellation'")
			.run();

		expect(store.listBetween('2026-10-05', '2026-10-11')).toEqual([
			{
				kind: 'roomChange',
				subjectId,
				lessonName: '線形代数 I',
				date: '2026-10-05',
				period: 3,
				room: '502',
				fromRoom: '401',
				comment: null,
				makeupPlan: null,
			},
			{
				kind: 'roomChange',
				subjectId: null,
				lessonName: 'ほかの科目',
				date: '2026-10-06',
				period: 3,
				room: '502',
				fromRoom: '401',
				comment: '教員の都合',
				makeupPlan: null,
			},
		]);
	});
});
