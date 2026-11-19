import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findMigrationsFolder } from './migrations-path.ts';

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'funmary-migrations-'));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

/** dir の下に、マイグレーションのフォルダ (マイグレーションごとのフォルダに migration.sql があるもの) を作る */
function makeMigrations(dir: string) {
	mkdirSync(join(dir, 'migrations', '20260924174109_initial'), { recursive: true });
	writeFileSync(join(dir, 'migrations', '20260924174109_initial', 'migration.sql'), '');
}

describe('findMigrationsFolder', () => {
	it('自分のフォルダの 1 つ上にあれば、それを返す (手元のビルドの出力: server/chunks/hooks.js)', () => {
		const chunk = join(root, 'server', 'chunks');
		mkdirSync(chunk, { recursive: true });
		makeMigrations(join(root, 'server'));
		expect(findMigrationsFolder(chunk)).toBe(join(root, 'server', 'migrations'));
	});

	it('さらに深い場所 (server/chunks/entries/hooks.js) からでも、上の階層をたどって見つける', () => {
		const chunk = join(root, 'server', 'chunks', 'entries');
		mkdirSync(chunk, { recursive: true });
		makeMigrations(join(root, 'server'));
		expect(findMigrationsFolder(chunk)).toBe(join(root, 'server', 'migrations'));
	});

	it('自分のフォルダの中にあってもよい (リリースの cli.js の隣)', () => {
		makeMigrations(root);
		expect(findMigrationsFolder(root)).toBe(join(root, 'migrations'));
	});

	it('マイグレーション (<名前>/migration.sql) のない migrations (別の用途のフォルダ) は使わない', () => {
		mkdirSync(join(root, 'migrations', 'notes'), { recursive: true });
		writeFileSync(join(root, 'migrations', 'notes', 'README.md'), '');
		expect(findMigrationsFolder(root)).toBeUndefined();
	});

	it('近いほうを先に返す', () => {
		const inner = join(root, 'server', 'chunks');
		mkdirSync(inner, { recursive: true });
		makeMigrations(root);
		makeMigrations(join(root, 'server'));
		expect(findMigrationsFolder(inner)).toBe(join(root, 'server', 'migrations'));
	});

	it('見つからなければ undefined (DB のパッケージの既定に任せる)', () => {
		mkdirSync(join(root, 'a', 'b'), { recursive: true });
		expect(findMigrationsFolder(join(root, 'a', 'b'))).toBeUndefined();
	});
});
