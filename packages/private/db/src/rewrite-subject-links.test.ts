import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAuthStore } from './auth-store.ts';
import type { Database } from './database.ts';
import { createSubjectStore } from './subject-store.ts';
import { readFileSync } from 'node:fs';
import { useTestDatabase } from './testing.ts';

let database: Database;
useTestDatabase('funmary-links-', (db) => (database = db));

describe('マイグレーション 0004: 授業の URL の書き換え', () => {
	it('DB の ID の形の URL を、年度とシラバスの番号の形にする。新しい形と、ほかの URL は変えない', () => {
		const now = new Date('2026-09-28T00:00:00Z');
		const userId = createAuthStore(database).createUser(
			{ googleSub: 'u', email: 'u@fun.ac.jp', name: null, role: 'user' },
			now,
		);
		const id = createSubjectStore(database).upsert(
			{
				academicYear: 2026,
				syllabusId: '100201',
				name: '授業',
				teacher: null,
				credits: 2,
				term: 'fall',
				attributes: {},
				syllabus: {},
				syllabusUrl: null,
			},
			now,
		);
		const links = [
			`/app/subjects/${id}`,
			`/subjects/${id}`,
			'/app/subjects/2026/100201',
			'/app/subjects/9999',
			'/app/week',
			null,
		];
		const insert = database.sqlite.prepare(
			`INSERT INTO notifications (user_id, kind, title, link) VALUES (?, 'x', 't', ?)`,
		);
		for (const link of links) insert.run(userId, link);

		const sql = readFileSync(
			join(
				import.meta.dirname,
				'..',
				'migrations',
				'20260928125050_rewrite_subject_links',
				'migration.sql',
			),
			'utf8',
		);
		database.sqlite.exec(sql);

		const rows = database.sqlite.prepare('SELECT link FROM notifications ORDER BY id').all() as {
			link: string | null;
		}[];
		expect(rows.map((row) => row.link)).toEqual([
			'/app/subjects/2026/100201',
			'/app/subjects/2026/100201',
			'/app/subjects/2026/100201',
			'/app/subjects/9999',
			'/app/week',
			null,
		]);
	});
});
