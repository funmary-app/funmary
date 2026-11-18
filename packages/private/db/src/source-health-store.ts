// 取得元の状態の状態 (@funmary/core の SourceHealth) を、source_status のテーブルに保存する。
import { INITIAL_SOURCE_HEALTH, type SourceHealth } from '@funmary/core';
import { eq } from 'drizzle-orm';
import type { Database } from './database.ts';
import { sourceStatus } from './schema.ts';

export interface SourceHealthStore {
	/** 記録のない取得元は、初期の状態 (一度も試していない) で返す */
	load(source: string): SourceHealth;
	save(source: string, health: SourceHealth): void;
	/** 記録のある取得元を、名前の順に返す (管理用の表示に使う) */
	list(): { readonly source: string; readonly health: SourceHealth }[];
}

type Row = typeof sourceStatus.$inferSelect;

function toHealth(row: Row): SourceHealth {
	return {
		lastSuccessAt: row.lastSuccessAt,
		lastAttemptAt: row.lastAttemptAt,
		consecutiveFailures: row.consecutiveFailures,
		nextAttemptAt: row.nextAttemptAt,
		lastError: row.lastError,
		contentHash: row.contentHash,
	};
}

export function createSourceHealthStore(database: Database): SourceHealthStore {
	const { db } = database;
	return {
		load(source) {
			const row = db.select().from(sourceStatus).where(eq(sourceStatus.source, source)).get();
			return row ? toHealth(row) : INITIAL_SOURCE_HEALTH;
		},
		save(source, health) {
			db.insert(sourceStatus)
				.values({ source, ...health })
				.onConflictDoUpdate({ target: sourceStatus.source, set: { ...health } })
				.run();
		},
		list() {
			return db
				.select()
				.from(sourceStatus)
				.orderBy(sourceStatus.source)
				.all()
				.map((row) => ({ source: row.source, health: toHealth(row) }));
		},
	};
}
