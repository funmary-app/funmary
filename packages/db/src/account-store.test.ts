import { describe, expect, it } from 'vitest';
import { subjectAbbreviations } from './schema.ts';
import { createAccessTokenStore } from './access-token-store.ts';
import { createAccountStore } from './account-store.ts';
import { createAuthStore } from './auth-store.ts';
import { createCourseStore } from './course-store.ts';
import type { Database } from './database.ts';
import { createSubjectStore } from './subject-store.ts';
import { createUserEventStore } from './user-event-store.ts';
import { useTestDatabase } from './testing.ts';

let database: Database;
useTestDatabase('funmary-account-', (db) => (database = db));

const T0 = new Date('2026-10-01T00:00:00Z');

function setup() {
	const auth = createAuthStore(database);
	const userId = auth.createUser(
		{ googleSub: 'a', email: 'a@fun.ac.jp', name: '架空 太郎', role: 'user' },
		T0,
	);
	auth.acceptTerms(userId, '2026-10-03', T0);
	const subjects = createSubjectStore(database);
	const subjectId = subjects.upsert(
		{
			academicYear: 2026,
			syllabusId: '100001',
			name: '架空の代数',
			teacher: null,
			credits: 2,
			term: 'fall',
			attributes: {},
			syllabus: {},
			syllabusUrl: null,
		},
		T0,
	);
	createCourseStore(database).register(userId, subjectId, T0);
	createUserEventStore(database).create(
		userId,
		{
			title: '架空のサークル',
			location: null,
			notes: null,
			startDate: '2026-10-05',
			endDate: '2026-10-05',
			time: { kind: 'allDay' },
			rrule: null,
			excludedDates: [],
			visibility: 'link',
		},
		T0,
	);
	database.db
		.insert(subjectAbbreviations)
		.values({ userId, subjectId, abbreviation: '代数', updatedAt: T0 })
		.run();
	const token = createAccessTokenStore(database).issue(
		userId,
		{ name: 'test', scopes: ['read:lessons'] },
		new Date('2027-01-01T00:00:00Z'),
		T0,
	);
	return { userId, subjectId, token, subjects };
}

describe('exportData', () => {
	it('利用者のデータをまとめ、トークンなどの秘密は入れない', () => {
		const { userId, token } = setup();

		const data = createAccountStore(database).exportData(userId, T0);

		expect(data).toMatchObject({
			account: { email: 'a@fun.ac.jp', name: '架空 太郎' },
			termsAcceptances: [{ version: '2026-10-03' }],
			courseRegistrations: [{ syllabusId: '100001', subjectName: '架空の代数' }],
			events: [{ title: '架空のサークル' }],
			subjectAbbreviations: [{ syllabusId: '100001', abbreviation: '代数' }],
			accessTokens: [{ name: 'test', scopes: ['read:lessons'], revoked: false }],
		});
		const text = JSON.stringify(data);
		expect(text).not.toContain(token);
		expect(text).not.toContain('shareToken');
		expect(text).not.toContain('tokenHash');
	});

	it('いない利用者は null', () => {
		expect(createAccountStore(database).exportData('none', T0)).toBeNull();
	});
});

describe('deleteAccount', () => {
	it('利用者と、持ち物をすべて消す。科目そのものと、他人のデータは残す', () => {
		const { userId, subjectId, token } = setup();
		const other = createAuthStore(database).createUser(
			{ googleSub: 'b', email: 'b@fun.ac.jp', name: null, role: 'user' },
			T0,
		);
		createCourseStore(database).register(other, subjectId, T0);

		expect(createAccountStore(database).deleteAccount(userId)).toBe(true);

		expect(createAuthStore(database).findUserById(userId)).toBeNull();
		expect(createCourseStore(database).listRegistrations(userId)).toEqual([]);
		expect(createUserEventStore(database).listByOwner(userId)).toEqual([]);
		expect(createAccessTokenStore(database).findOwner(token, T0)).toBeNull();
		expect(createCourseStore(database).listRegistrations(other)).toHaveLength(1);
		expect(createSubjectStore(database).findById(subjectId)).not.toBeNull();
	});

	it('自分だけが見られる足した科目は消し、公開した科目は残す', () => {
		const { userId, subjects } = setup();
		const privateId = subjects.createUserSubject(
			{ academicYear: 2026, name: '非公開の授業', term: 'fall', teacher: null },
			userId,
			T0,
		);
		subjects.setVisibility(privateId, 'private');
		const publicId = subjects.createUserSubject(
			{ academicYear: 2026, name: '公開した授業', term: 'fall', teacher: null },
			userId,
			T0,
		);
		subjects.setVisibility(publicId, 'public');

		createAccountStore(database).deleteAccount(userId);

		expect(subjects.findById(privateId)).toBeNull();
		expect(subjects.findById(publicId)?.createdBy).toBeNull();
	});

	it('いない利用者なら false', () => {
		expect(createAccountStore(database).deleteAccount('none')).toBe(false);
	});
});
