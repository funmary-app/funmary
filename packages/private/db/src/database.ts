// SQLite の DB を開く。設定、壊れていないかの確認、バックアップ、マイグレーションまでを 1 か所で行う。
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import BetterSqlite3 from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';

export interface Database {
	readonly db: BetterSQLite3Database;
	/** better-sqlite3 そのもの。PRAGMA やバックアップなど、Drizzle で書けない操作に使う */
	readonly sqlite: BetterSqlite3.Database;
	close(): void;
}

export interface OpenOptions {
	/** マイグレーションの前に取るバックアップの置き場所 */
	readonly backupDir: string;
	readonly migrationsFolder?: string;
	/** バックアップのファイル名に使う時刻。テストで差し替える */
	readonly now?: () => Date;
}

const DEFAULT_MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

export class DatabaseCorruptedError extends Error {
	override readonly name = 'DatabaseCorruptedError';
}

export class MigrationFailedError extends Error {
	override readonly name = 'MigrationFailedError';
}

export function openDatabase(path: string, options: OpenOptions): Database {
	const sqlite = new BetterSqlite3(path);
	try {
		try {
			configure(sqlite);
		} catch (cause) {
			// DB のファイルとして読めないときは、設定の時点で失敗する
			throw corrupted(path, options.backupDir, cause);
		}
		checkIntegrity(sqlite, path, options.backupDir);
		const migrationsFolder = options.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER;
		const db = drizzle({ client: sqlite });
		if (hasPendingMigrations(sqlite, migrationsFolder) && hasUserTables(sqlite)) {
			backup(sqlite, options.backupDir, (options.now ?? (() => new Date()))());
		}
		try {
			migrate(db, { migrationsFolder });
		} catch (cause) {
			throw new MigrationFailedError(
				`migration に失敗したので起動を止めます。DB はマイグレーションの前の状態のままです。バックアップは ${options.backupDir} にあります`,
				{ cause },
			);
		}
		return { db, sqlite, close: () => sqlite.close() };
	} catch (error) {
		sqlite.close();
		throw error;
	}
}

function configure(sqlite: BetterSqlite3.Database): void {
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('synchronous = NORMAL');
	sqlite.pragma('busy_timeout = 5000');
	sqlite.pragma('foreign_keys = ON');
}

function checkIntegrity(sqlite: BetterSqlite3.Database, path: string, backupDir: string): void {
	let result: unknown;
	try {
		result = sqlite.pragma('quick_check', { simple: true });
	} catch (cause) {
		throw corrupted(path, backupDir, cause);
	}
	if (result !== 'ok') throw corrupted(path, backupDir, result);
}

function corrupted(path: string, backupDir: string, cause: unknown): DatabaseCorruptedError {
	return new DatabaseCorruptedError(
		`DB (${path}) が壊れているので起動を止めます。${backupDir} のバックアップから戻してください: funmary-admin restore <ファイル>`,
		{ cause },
	);
}

function hasPendingMigrations(sqlite: BetterSqlite3.Database, migrationsFolder: string): boolean {
	const total = readMigrationFiles({ migrationsFolder }).length;
	const table = sqlite
		.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
		.get();
	if (!table) return total > 0;
	const { applied } = sqlite
		.prepare('SELECT count(*) AS applied FROM __drizzle_migrations')
		.get() as {
		applied: number;
	};
	return applied < total;
}

function hasUserTables(sqlite: BetterSqlite3.Database): boolean {
	const row = sqlite
		.prepare(
			"SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' LIMIT 1",
		)
		.get();
	return row !== undefined;
}

function backup(sqlite: BetterSqlite3.Database, backupDir: string, now: Date): void {
	mkdirSync(backupDir, { recursive: true });
	const stamp = now.toISOString().replace(/[:.]/g, '-');
	// VACUUM INTO は、書き込み中の DB からも一貫した複製を同期的に作れる
	sqlite.prepare('VACUUM INTO ?').run(join(backupDir, `before-migration-${stamp}.db`));
}

/**
 * DB に読み書きできるかを確かめる (/healthz が使う)。
 * 書き込みの権利を取ってすぐ手放すので、データは変えない。閉じた DB やディスクの不調では false を返す。
 */
export function checkHealth(database: Database): boolean {
	try {
		database.sqlite.exec('BEGIN IMMEDIATE; ROLLBACK;');
		return true;
	} catch {
		return false;
	}
}
