import {
	createAccessGrantStore,
	createApiActivityStore,
	createAuthStore,
	createCourseStore,
	createPersonalSlotStore,
	createSubjectAbbreviationStore,
	createSubjectStore,
	type Database,
} from '@funmary/db';
import { useTestDatabase } from '@funmary/db/testing';
import { describe, expect, it } from 'vitest';
import {
	registerCourse,
	removePersonalSlot,
	setAbbreviation,
	setPersonalSlot,
	unregisterCourse,
} from './courses.ts';
import type { WriteActor } from './events.ts';

let database: Database;
useTestDatabase('funmary-write-courses-', (db) => (database = db));

// 2026-10-07 は 2026 年度
const NOW = new Date('2026-10-07T00:00:00Z');

function setup() {
	const auth = createAuthStore(database);
	const user = (sub: string) =>
		auth.createUser({ googleSub: sub, email: `${sub}@fun.ac.jp`, name: null, role: 'user' }, NOW);
	const subjectStore = createSubjectStore(database);
	const base = {
		academicYear: 2026,
		credits: 2,
		teacher: null,
		term: 'fall' as const,
		attributes: {},
		syllabus: {},
		syllabusUrl: null,
	};
	subjectStore.upsert({ ...base, syllabusId: '100', name: '線形代数' }, NOW);
	subjectStore.upsert({ ...base, syllabusId: '101', name: '線形代数演習' }, NOW);
	subjectStore.upsert({ ...base, syllabusId: '200', name: '情報アーキテクチャ' }, NOW);
	subjectStore.upsert({ ...base, syllabusId: '201', name: '情報アーキテクチャ' }, NOW);
	const sources = {
		subjects: subjectStore,
		accessGrants: createAccessGrantStore(database),
		users: auth,
		courses: createCourseStore(database),
		personalSlots: createPersonalSlotStore(database),
		subjectAbbreviations: createSubjectAbbreviationStore(database),
		activity: createApiActivityStore(database),
	};
	const actorOf = (userId: string): WriteActor => ({
		userId,
		tokenId: 3,
		tokenName: '手元の Claude Desktop',
	});
	return { sources, user, actorOf };
}

const LINEAR = { academicYear: 2026, syllabusId: '100' };

describe('履修登録', () => {
	it('年度とシラバスの番号で登録し、状態と履歴を返す', () => {
		const { sources, user, actorOf } = setup();
		const a = user('a');

		const result = registerCourse(sources, actorOf(a), LINEAR, NOW);

		expect(result).toMatchObject({
			ok: true,
			course: { subject: { name: '線形代数', syllabusId: '100' }, registered: true },
		});
		expect(sources.courses.listRegistrations(a)).toHaveLength(1);
		expect(sources.activity.listRecent(a)).toMatchObject([
			{ action: 'course.register', tokenName: '手元の Claude Desktop' },
		]);
	});

	it('登録済みの科目を、もう一度登録しても、履歴を増やさない (何度呼んでも同じ結果)', () => {
		const { sources, user, actorOf } = setup();
		const a = user('a');
		registerCourse(sources, actorOf(a), LINEAR, NOW);

		const again = registerCourse(sources, actorOf(a), LINEAR, NOW);

		expect(again).toMatchObject({ ok: true, course: { registered: true } });
		expect(sources.activity.listRecent(a)).toHaveLength(1);
	});

	it('名前で指すと、ただ 1 つに決まれば登録する (部分一致でも、1 件なら)', () => {
		const { sources, user, actorOf } = setup();
		const a = user('a');

		const result = registerCourse(sources, actorOf(a), { name: 'アーキ' }, NOW);
		expect(result).toMatchObject({ ok: false, kind: 'ambiguous' });

		const exact = registerCourse(sources, actorOf(a), { name: '線形代数演習' }, NOW);
		expect(exact).toMatchObject({ ok: true, course: { subject: { syllabusId: '101' } } });
	});

	it('名前の完全一致が 1 件あれば、部分一致が別にあっても、それを選ぶ', () => {
		const { sources, user, actorOf } = setup();
		const a = user('a');
		const result = registerCourse(sources, actorOf(a), { name: '線形代数' }, NOW);
		expect(result).toMatchObject({ ok: true, course: { subject: { syllabusId: '100' } } });
	});

	it('名前が複数に当たったら、登録せず、候補を返す', () => {
		const { sources, user, actorOf } = setup();
		const a = user('a');

		const result = registerCourse(sources, actorOf(a), { name: '情報アーキテクチャ' }, NOW);

		expect(result).toMatchObject({
			ok: false,
			kind: 'ambiguous',
			candidates: [{ syllabusId: '200' }, { syllabusId: '201' }],
		});
		expect(sources.courses.listRegistrations(a)).toEqual([]);
		expect(sources.activity.listRecent(a)).toEqual([]);
	});

	it('名前の年度を指定すると、その年度の科目から探す', () => {
		const { sources, user, actorOf } = setup();
		const a = user('a');
		const result = registerCourse(
			sources,
			actorOf(a),
			{ name: '線形代数演習', academicYear: 2025 },
			NOW,
		);
		expect(result).toMatchObject({ ok: false, kind: 'not_found' });
	});

	it('ない科目は not_found', () => {
		const { sources, user, actorOf } = setup();
		const a = user('a');
		expect(
			registerCourse(sources, actorOf(a), { academicYear: 2026, syllabusId: '999' }, NOW),
		).toMatchObject({ ok: false, kind: 'not_found' });
		expect(registerCourse(sources, actorOf(a), { name: '存在しない' }, NOW)).toMatchObject({
			ok: false,
			kind: 'not_found',
		});
	});

	it('ほかの人の非公開の科目は、見つからないことにする', () => {
		const { sources, user, actorOf } = setup();
		const owner = user('owner');
		const other = user('other');
		const id = sources.subjects.createUserSubject(
			{ academicYear: 2026, name: 'こっそり科目', term: 'fall', teacher: null },
			owner,
			NOW,
		);
		sources.subjects.setVisibility(id, 'private');
		const subject = sources.subjects.findById(id)!;
		const ref = { academicYear: 2026, syllabusId: subject.syllabusId };

		expect(registerCourse(sources, actorOf(other), ref, NOW)).toMatchObject({
			ok: false,
			kind: 'not_found',
		});
		expect(registerCourse(sources, actorOf(owner), ref, NOW)).toMatchObject({ ok: true });
	});
});

describe('履修登録の解除', () => {
	it('履修登録を取り消しても、個人用の曜日と時限、略称は残る', () => {
		const { sources, user, actorOf } = setup();
		const a = user('a');
		const actor = actorOf(a);
		registerCourse(sources, actor, LINEAR, NOW);
		setPersonalSlot(sources, actor, LINEAR, { weekday: 2, period: 3, room: '363' }, NOW);
		setAbbreviation(sources, actor, LINEAR, '線形', NOW);

		const result = unregisterCourse(sources, actor, LINEAR, NOW);

		expect(result).toMatchObject({
			ok: true,
			course: {
				registered: false,
				personalSlots: [{ weekday: 2, period: 3, room: '363' }],
				abbreviation: '線形',
			},
		});
		expect(sources.courses.listRegistrations(a)).toEqual([]);
		expect(sources.activity.listRecent(a)[0]).toMatchObject({ action: 'course.unregister' });
	});

	it('登録していない科目の解除は not_found', () => {
		const { sources, user, actorOf } = setup();
		const a = user('a');
		expect(unregisterCourse(sources, actorOf(a), LINEAR, NOW)).toMatchObject({
			ok: false,
			kind: 'not_found',
		});
	});
});

describe('自分だけの曜日と時限', () => {
	it('履修している科目に足すと、状態に出る。同じ曜日と時限なら教室を上書きする', () => {
		const { sources, user, actorOf } = setup();
		const a = user('a');
		registerCourse(sources, actorOf(a), LINEAR, NOW);

		setPersonalSlot(sources, actorOf(a), LINEAR, { weekday: 2, period: 3, room: '363' }, NOW);
		const result = setPersonalSlot(
			sources,
			actorOf(a),
			LINEAR,
			{ weekday: 2, period: 3, room: '484' },
			NOW,
		);

		expect(result).toMatchObject({
			ok: true,
			course: { personalSlots: [{ weekday: 2, period: 3, room: '484' }] },
		});
		expect(sources.activity.listRecent(a)[0]).toMatchObject({ action: 'course.personalSlot.set' });
	});

	it('履修していない科目には足せない', () => {
		const { sources, user, actorOf } = setup();
		const a = user('a');
		expect(
			setPersonalSlot(sources, actorOf(a), LINEAR, { weekday: 2, period: 3, room: null }, NOW),
		).toMatchObject({ ok: false, kind: 'not_registered' });
	});

	it('曜日や時限が範囲の外なら、書き込まない', () => {
		const { sources, user, actorOf } = setup();
		const a = user('a');
		registerCourse(sources, actorOf(a), LINEAR, NOW);
		const result = setPersonalSlot(
			sources,
			actorOf(a),
			LINEAR,
			{ weekday: 7, period: 3, room: null },
			NOW,
		);
		expect(result).toMatchObject({ ok: false, kind: 'invalid' });
	});

	it('消せる。ない枠を消そうとしたら not_found', () => {
		const { sources, user, actorOf } = setup();
		const a = user('a');
		registerCourse(sources, actorOf(a), LINEAR, NOW);
		setPersonalSlot(sources, actorOf(a), LINEAR, { weekday: 2, period: 3, room: null }, NOW);

		expect(removePersonalSlot(sources, actorOf(a), LINEAR, 2, 3, NOW)).toMatchObject({
			ok: true,
			course: { personalSlots: [] },
		});
		expect(removePersonalSlot(sources, actorOf(a), LINEAR, 2, 3, NOW)).toMatchObject({
			ok: false,
			kind: 'not_found',
		});
	});
});

describe('科目の略称', () => {
	it('略称を保存し、空にすると正式名称に戻す指定になる', () => {
		const { sources, user, actorOf } = setup();
		const a = user('a');

		const set = setAbbreviation(sources, actorOf(a), LINEAR, ' 線代 ', NOW);
		expect(set).toMatchObject({ ok: true, course: { abbreviation: '線代' } });
		expect(sources.activity.listRecent(a)[0]).toMatchObject({ action: 'course.abbreviation' });

		const cleared = setAbbreviation(sources, actorOf(a), LINEAR, '', NOW);
		expect(cleared).toMatchObject({ ok: true, course: { abbreviation: '' } });
	});

	it('長すぎる略称は invalid', () => {
		const { sources, user, actorOf } = setup();
		const a = user('a');
		expect(setAbbreviation(sources, actorOf(a), LINEAR, 'あ'.repeat(101), NOW)).toMatchObject({
			ok: false,
			kind: 'invalid',
		});
	});
});
