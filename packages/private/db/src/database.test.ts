import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkHealth, openDatabase, type Database } from './database.ts';
import { sessions, users } from './schema.ts';

let dir: string;
let opened: Database[] = [];

function open(name = 'funmary.db') {
	const database = openDatabase(join(dir, name), { backupDir: join(dir, 'backups') });
	opened.push(database);
	return database;
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'funmary-db-'));
	opened = [];
});

afterEach(() => {
	for (const database of opened) database.close();
	rmSync(dir, { recursive: true, force: true });
});

describe('openDatabase', () => {
	it('設計どおりの設定で開く (WAL、synchronous=NORMAL、busy_timeout、外部キー)', () => {
		const { sqlite } = open();
		expect(sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
		expect(sqlite.pragma('synchronous', { simple: true })).toBe(1);
		expect(sqlite.pragma('busy_timeout', { simple: true })).toBe(5000);
		expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
	});

	it('新しい DB にはマイグレーションを当て、テーブルを作る。新しい DB のバックアップは取らない', () => {
		const { db } = open();
		db.insert(users)
			.values({ id: 'u1', email: 'someone@example.com', googleSub: 'sub-1', name: 'テスト' })
			.run();
		expect(db.select().from(users).all()).toHaveLength(1);
		expect(existsSync(join(dir, 'backups'))).toBe(false);
	});

	it('2 回目に開くときは、当てるマイグレーションがなければバックアップを取らない', () => {
		open().close();
		opened = [];
		open();
		expect(existsSync(join(dir, 'backups'))).toBe(false);
	});

	it('外部キーが効き、利用者を消すとセッションも消える', () => {
		const { db } = open();
		db.insert(users).values({ id: 'u1', email: 'a@example.com', googleSub: 'sub-1' }).run();
		db.insert(sessions)
			.values({ idHash: 'h1', userId: 'u1', expiresAt: new Date('2026-10-25T00:00:00Z') })
			.run();
		expect(() =>
			db
				.insert(sessions)
				.values({ idHash: 'h2', userId: 'missing', expiresAt: new Date('2026-10-25T00:00:00Z') })
				.run(),
		).toThrow();
		db.delete(users).where(eq(users.id, 'u1')).run();
		expect(db.select().from(sessions).all()).toEqual([]);
	});

	it('壊れた DB は開かずに止まり、バックアップからの戻し方を示す', () => {
		const path = join(dir, 'broken.db');
		writeFileSync(path, 'SQLite format 3\0' + 'x'.repeat(4096));
		expect(() => open('broken.db')).toThrow(/restore/);
	});

	it('既存の DB にマイグレーションを当てる前にバックアップを取り、失敗したら止まる', () => {
		const database = open();
		// マイグレーションの記録を消し、当てていないことにする。テーブルはあるので、当て直すと失敗する
		database.sqlite.exec('DELETE FROM __drizzle_migrations');
		database.close();
		opened = [];
		expect(() => open()).toThrow(/migration/i);
		expect(readdirSync(join(dir, 'backups'))).toHaveLength(1);
	});

	it('マイグレーションの記録の表が古い形 (Drizzle 1.0 より前) なら、新しい形に変える前にバックアップを取る', () => {
		const database = open();
		const applied = database.sqlite.prepare('SELECT hash FROM __drizzle_migrations').all();
		// Drizzle 1.0 より前の表には、name と applied_at の列がない
		database.sqlite.exec(
			'ALTER TABLE __drizzle_migrations DROP COLUMN applied_at; ALTER TABLE __drizzle_migrations DROP COLUMN name;',
		);
		database.close();
		opened = [];

		const reopened = open();
		expect(readdirSync(join(dir, 'backups'))).toHaveLength(1);
		// 当てたマイグレーションは当て直さず、記録はそのまま残る
		expect(reopened.sqlite.prepare('SELECT hash FROM __drizzle_migrations').all()).toEqual(applied);
	});
});

describe('checkHealth', () => {
	it('開いている DB では、読み書きできるとみなす。データは変えない', () => {
		const database = open();
		const before = database.sqlite.prepare('SELECT total_changes() AS n').get();
		expect(checkHealth(database)).toBe(true);
		expect(database.sqlite.prepare('SELECT total_changes() AS n').get()).toEqual(before);
	});

	it('閉じた DB では、読み書きできないとみなす', () => {
		const database = open();
		database.close();
		expect(checkHealth(database)).toBe(false);
	});
});
