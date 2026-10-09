import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuthStore } from './auth-store.ts';
import { openDatabase, type Database } from './database.ts';
import { createSubjectAbbreviationStore } from './subject-abbreviation-store.ts';
import { createSubjectStore } from './subject-store.ts';

let dir: string;
let database: Database;
const now = new Date('2026-10-01T00:00:00Z');

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'funmary-abbreviations-'));
	database = openDatabase(join(dir, 'funmary.db'), { backupDir: join(dir, 'backups') });
});

afterEach(() => {
	database.close();
	rmSync(dir, { recursive: true, force: true });
});

const setup = () => {
	const auth = createAuthStore(database);
	const userId = auth.createUser(
		{ googleSub: 'abbreviation-a', email: 'abbreviation-a@example.com', name: null, role: 'user' },
		now,
	);
	const otherId = auth.createUser(
		{ googleSub: 'abbreviation-b', email: 'abbreviation-b@example.com', name: null, role: 'user' },
		now,
	);
	const subjects = createSubjectStore(database);
	const subjectId = subjects.createUserSubject(
		{ academicYear: 2026, name: '架空の長い授業名', term: 'fall', teacher: null },
		userId,
		now,
	);
	const otherSubjectId = subjects.createUserSubject(
		{ academicYear: 2026, name: '架空の別の授業', term: 'fall', teacher: null },
		userId,
		now,
	);
	return { userId, otherId, subjectId, otherSubjectId };
};

describe('科目の個人用略称', () => {
	it('未保存と空欄保存を区別し、利用者と科目ごとに保存する', () => {
		const { userId, otherId, subjectId, otherSubjectId } = setup();
		const store = createSubjectAbbreviationStore(database);
		expect(store.get(userId, subjectId)).toBeUndefined();
		store.set(userId, subjectId, '長い授業', now);
		store.set(userId, otherSubjectId, '', now);
		expect(store.get(userId, subjectId)).toBe('長い授業');
		expect(store.get(userId, otherSubjectId)).toBe('');
		expect(store.get(otherId, subjectId)).toBeUndefined();
		expect(store.list(userId)).toEqual(
			new Map([
				[subjectId, '長い授業'],
				[otherSubjectId, ''],
			]),
		);
		expect(store.list(otherId)).toEqual(new Map());
	});

	it('保存し直すと同じ利用者の値だけを更新し、DBを開き直しても残る', () => {
		const { userId, otherId, subjectId } = setup();
		const store = createSubjectAbbreviationStore(database);
		store.set(userId, subjectId, '略称', now);
		store.set(otherId, subjectId, '別の略称', now);
		store.set(userId, subjectId, '', now);
		database.close();
		database = openDatabase(join(dir, 'funmary.db'), { backupDir: join(dir, 'backups') });
		const reopened = createSubjectAbbreviationStore(database);
		expect(reopened.get(userId, subjectId)).toBe('');
		expect(reopened.get(otherId, subjectId)).toBe('別の略称');
	});

	it('科目や利用者が消えると対応する略称も消える', () => {
		const { userId, otherId, subjectId, otherSubjectId } = setup();
		const store = createSubjectAbbreviationStore(database);
		store.set(userId, subjectId, '略称', now);
		store.set(otherId, otherSubjectId, '別の略称', now);
		createSubjectStore(database).deleteUserSubject(subjectId);
		expect(store.get(userId, subjectId)).toBeUndefined();
		database.sqlite.prepare('DELETE FROM users WHERE id = ?').run(otherId);
		expect(store.list(otherId)).toEqual(new Map());
	});
});
