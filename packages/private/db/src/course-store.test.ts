import { describe, expect, it } from 'vitest';
import { createAuthStore } from './auth-store.ts';
import { createCourseStore, type PortalCell } from './course-store.ts';
import type { Database } from './database.ts';
import { createSubjectStore } from './subject-store.ts';
import { useTestDatabase } from './testing.ts';

let database: Database;
useTestDatabase('funmary-courses-', (db) => (database = db));

const T0 = new Date('2026-09-27T00:00:00Z');

function setup() {
	const auth = createAuthStore(database);
	const alice = auth.createUser(
		{ googleSub: 'a', email: 'a@fun.ac.jp', name: null, role: 'user' },
		T0,
	);
	const bob = auth.createUser(
		{ googleSub: 'b', email: 'b@fun.ac.jp', name: null, role: 'user' },
		T0,
	);
	const subjects = createSubjectStore(database);
	const subjectId = subjects.upsert(
		{
			academicYear: 2026,
			syllabusId: '100002',
			name: '架空の科目B',
			teacher: null,
			credits: 2,
			term: 'fall',
			attributes: {},
			syllabus: {},
			syllabusUrl: null,
		},
		T0,
	);
	return { auth, alice, bob, subjectId, courses: createCourseStore(database) };
}

const cell = (over: Partial<PortalCell> = {}): PortalCell => ({
	lessonId: '100002',
	year: 2026,
	weekday: 1,
	period: 1,
	room: '494C&D',
	hopeUrl: 'https://hope.fun.ac.jp/2026/course/view.php?idnumber=1',
	...over,
});

describe('CourseStore.importFromPortal', () => {
	it('履修登録と、科目ごとの枠 (曜日、時限、教室) を登録する', () => {
		const { alice, subjectId, courses } = setup();
		const result = courses.importFromPortal(alice, [cell()], T0);
		expect(result).toMatchObject({ registered: 1, slotsAdded: 1, unknown: [], conflicts: [] });
		expect(courses.listRegistrations(alice)).toEqual([
			expect.objectContaining({
				subjectId,
				hopeCourseUrl: 'https://hope.fun.ac.jp/2026/course/view.php?idnumber=1',
			}),
		]);
		expect(courses.slotsOf(subjectId)).toEqual([
			expect.objectContaining({
				weekday: 1,
				period: 1,
				room: '494C&D',
				source: 'portal',
				createdBy: alice,
			}),
		]);
	});

	it('ほかの人が登録した枠は、同じ科目を取る全員で共有する (同じ内容なら、登録し直さない)', () => {
		const { alice, bob, subjectId, courses } = setup();
		courses.importFromPortal(alice, [cell()], T0);
		const result = courses.importFromPortal(bob, [cell()], T0);
		expect(result).toMatchObject({ registered: 1, slotsAdded: 0, conflicts: [] });
		expect(courses.slotsOf(subjectId)).toHaveLength(1);
		expect(courses.slotsOf(subjectId)[0]!.createdBy).toBe(alice);
	});

	it('既にある枠と教室が違えば、上書きせず、食い違いとして返す', () => {
		const { alice, bob, subjectId, courses } = setup();
		courses.importFromPortal(alice, [cell()], T0);
		const result = courses.importFromPortal(bob, [cell({ room: '595' })], T0);
		expect(result.conflicts).toEqual([
			{ subjectId, weekday: 1, period: 1, existingRoom: '494C&D', importedRoom: '595' },
		]);
		expect(courses.slotsOf(subjectId)[0]!.room).toBe('494C&D');
	});

	it('既にある枠の教室が空なら、取り込んだ教室で埋める', () => {
		const { alice, bob, subjectId, courses } = setup();
		courses.importFromPortal(alice, [cell({ room: null })], T0);
		const result = courses.importFromPortal(bob, [cell()], T0);
		expect(result).toMatchObject({ slotsUpdated: 1, conflicts: [] });
		expect(courses.slotsOf(subjectId)[0]!.room).toBe('494C&D');
	});

	it('まだ取り込んでいない科目は、登録せず、知らない科目として返す', () => {
		const { alice, courses } = setup();
		const result = courses.importFromPortal(alice, [cell({ lessonId: '999999' })], T0);
		expect(result).toMatchObject({ registered: 0, unknown: [{ lessonId: '999999', year: 2026 }] });
		expect(courses.listRegistrations(alice)).toEqual([]);
	});

	it('曜日と時限のないコマ (集中講義) は、履修登録だけ行う', () => {
		const { alice, subjectId, courses } = setup();
		const result = courses.importFromPortal(alice, [cell({ weekday: null, period: null })], T0);
		expect(result).toMatchObject({ registered: 1, slotsAdded: 0 });
		expect(courses.slotsOf(subjectId)).toEqual([]);
	});

	it('同じ取り込みを 2 回しても、履修登録は 1 つのまま', () => {
		const { alice, courses } = setup();
		courses.importFromPortal(alice, [cell()], T0);
		const again = courses.importFromPortal(alice, [cell()], T0);
		expect(again.registered).toBe(0);
		expect(courses.listRegistrations(alice)).toHaveLength(1);
	});

	it('退会した利用者が登録した枠は、残り、登録者だけ空になる', () => {
		const { alice, subjectId, courses } = setup();
		courses.importFromPortal(alice, [cell()], T0);
		database.sqlite.prepare('DELETE FROM users WHERE id = ?').run(alice);
		expect(courses.slotsOf(subjectId)).toEqual([
			expect.objectContaining({ room: '494C&D', createdBy: null }),
		]);
	});
});

describe('CourseStore.addSharedSlots', () => {
	it('管理者が時間割の PDF から取り込んだ枠を、出どころ pdf、登録者なしで足す', () => {
		const { subjectId, courses } = setup();
		const result = courses.addSharedSlots(
			[{ subjectId, weekday: 2, period: 3, room: '363,364' }],
			{ source: 'pdf', createdBy: null },
			T0,
		);
		expect(result).toEqual({ added: 1, updated: 0, conflicts: [] });
		expect(courses.slotsOf(subjectId)).toEqual([
			{ weekday: 2, period: 3, room: '363,364', source: 'pdf', createdBy: null },
		]);
	});

	it('既にある枠は上書きせず、教室の食い違いを返す。空の教室は埋める', () => {
		const { alice, subjectId, courses } = setup();
		courses.importFromPortal(alice, [cell(), cell({ period: 2, room: null })], T0);
		const result = courses.addSharedSlots(
			[
				{ subjectId, weekday: 1, period: 1, room: '595' },
				{ subjectId, weekday: 1, period: 2, room: '363' },
			],
			{ source: 'pdf', createdBy: null },
			T0,
		);
		expect(result).toEqual({
			added: 0,
			updated: 1,
			conflicts: [
				{ subjectId, weekday: 1, period: 1, existingRoom: '494C&D', importedRoom: '595' },
			],
		});
		expect(courses.slotsOf(subjectId).map((s) => [s.room, s.source])).toEqual([
			['494C&D', 'portal'],
			['363', 'portal'],
		]);
	});

	it('同じ取り込みを 2 回しても、枠は増えない', () => {
		const { subjectId, courses } = setup();
		const slots = [{ subjectId, weekday: 2, period: 3, room: '363' }];
		courses.addSharedSlots(slots, { source: 'pdf', createdBy: null }, T0);
		const again = courses.addSharedSlots(slots, { source: 'pdf', createdBy: null }, T0);
		expect(again).toEqual({ added: 0, updated: 0, conflicts: [] });
		expect(courses.slotsOf(subjectId)).toHaveLength(1);
	});
});

describe('CourseStore.subjectsAt', () => {
	it('その曜日と時限に共有の枠を持つ科目を返す', () => {
		const { subjectId, courses } = setup();
		const otherId = createSubjectStore(database).upsert(
			{
				academicYear: 2026,
				syllabusId: '100003',
				name: '架空の科目C',
				teacher: null,
				credits: 2,
				term: 'fall',
				attributes: {},
				syllabus: {},
				syllabusUrl: null,
			},
			T0,
		);
		courses.addSharedSlots(
			[
				{ subjectId: otherId, weekday: 2, period: 3, room: null },
				{ subjectId, weekday: 2, period: 3, room: '363' },
				{ subjectId, weekday: 4, period: 3, room: '363' },
			],
			{ source: 'pdf', createdBy: null },
			T0,
		);
		expect(courses.subjectsAt(2, 3)).toEqual([subjectId, otherId].sort((a, b) => a - b));
		expect(courses.subjectsAt(4, 3)).toEqual([subjectId]);
		expect(courses.subjectsAt(2, 4)).toEqual([]);
	});
});

describe('register と unregister', () => {
	it('科目を履修登録し、取り消せる。取り消しても共有の枠は残る', () => {
		const { alice, subjectId, courses } = setup();
		expect(courses.register(alice, subjectId, T0)).toBe(true);
		courses.addSharedSlots(
			[{ subjectId, weekday: 1, period: 1, room: '363' }],
			{ source: 'manual', createdBy: alice },
			T0,
		);
		expect(courses.listRegistrations(alice)).toEqual([{ subjectId, hopeCourseUrl: null }]);

		expect(courses.unregister(alice, subjectId)).toBe(true);
		expect(courses.listRegistrations(alice)).toEqual([]);
		expect(courses.slotsOf(subjectId)).toHaveLength(1);
	});

	it('登録済みの科目をもう一度登録しても、HOPE の URL は消えない', () => {
		const { alice, subjectId, courses } = setup();
		courses.importFromPortal(alice, [cell()], T0);
		expect(courses.register(alice, subjectId, T0)).toBe(false);
		expect(courses.listRegistrations(alice)[0]?.hopeCourseUrl).toBe(cell().hopeUrl);
	});

	it('ほかの利用者の登録は、取り消さない', () => {
		const { alice, bob, subjectId, courses } = setup();
		courses.register(alice, subjectId, T0);
		expect(courses.unregister(bob, subjectId)).toBe(false);
		expect(courses.listRegistrations(alice)).toHaveLength(1);
	});

	it('isRegistered は、その利用者が登録しているかを返す', () => {
		const { alice, bob, subjectId, courses } = setup();
		courses.register(alice, subjectId, T0);
		expect(courses.isRegistered(alice, subjectId)).toBe(true);
		expect(courses.isRegistered(bob, subjectId)).toBe(false);
	});
});

describe('CourseStore.usersWithoutRegistrationIn', () => {
	it('その年度の、その学期のどれかの科目を履修していない、利用中の利用者を返す', () => {
		const { auth, alice, bob, subjectId, courses } = setup();
		const carol = auth.createUser(
			{ googleSub: 'c', email: 'c@fun.ac.jp', name: null, role: 'user' },
			T0,
		);
		const dave = auth.createUser(
			{ googleSub: 'd', email: 'd@fun.ac.jp', name: null, role: 'user' },
			T0,
		);
		const springId = createSubjectStore(database).upsert(
			{
				academicYear: 2026,
				syllabusId: '100009',
				name: '架空の前期の科目',
				teacher: null,
				credits: 2,
				term: 'spring',
				attributes: {},
				syllabus: {},
				syllabusUrl: null,
			},
			T0,
		);
		// alice は後期の科目、bob は前期の科目だけ、carol は何も履修していない。dave は利用を止められている
		courses.register(alice, subjectId, T0);
		courses.register(bob, springId, T0);
		database.sqlite.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(dave);

		expect(courses.usersWithoutRegistrationIn(2026, ['fall', 'q3']).sort()).toEqual(
			[bob, carol].sort(),
		);
		expect(courses.usersWithoutRegistrationIn(2027, ['fall'])).toContain(alice);
	});
});
