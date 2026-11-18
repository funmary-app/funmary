// バスの時刻表の API から、停留所の一覧と発車表を取り込む定期処理。毎日、ETag を付けて取得し、変わったものだけを保存する。画面、API、Discord は保存した内容だけを読むので、API が止まっても前回までの時刻表で動き続ける。
import {
	isSourceDisabled,
	shouldAttempt,
	type BusCatalog,
	type BusStopTimetable,
	type SourceHealth,
} from '@funmary/core';
import type { FetchBusStopListResult, FetchBusStopTimetableResult } from '@funmary/sources';
import type { JobDefinition } from './runner.ts';
import { failSource, succeedSource, type SourceAlert, type SourceRun } from './source-run.ts';

/** SOURCES_DISABLED と source_status で使う、取得元の名前 */
export const BUS_SOURCE = 'bus';

/** 次に試すまでの間隔 (失敗のあとの待ちの基準) */
const INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface SyncBusDeps {
	readonly fetchCatalog: (etag: string | null) => Promise<FetchBusStopListResult>;
	readonly fetchTimetable: (request: {
		readonly stopId: string;
		readonly generation: number;
		readonly etag: string | null;
	}) => Promise<FetchBusStopTimetableResult>;
	/** SOURCES_DISABLED */
	readonly disabledSources: readonly string[];
	readonly health: {
		load(source: string): SourceHealth;
		save(source: string, health: SourceHealth): void;
	};
	readonly bus: {
		getCatalog(): { catalog: BusCatalog; etag: string | null; checkedAt: Date } | null;
		saveCatalog(catalog: BusCatalog, etag: string | null, at: Date): void;
		touchCatalog(at: Date): void;
		getTimetable(
			stopId: string,
			generation: number,
		): { timetable: BusStopTimetable; etag: string | null; checkedAt: Date } | null;
		saveTimetable(timetable: BusStopTimetable, etag: string | null, at: Date): void;
		touchTimetable(stopId: string, generation: number, at: Date): void;
		pruneTimetables(keep: { generations: readonly number[]; stopIds: readonly string[] }): void;
	};
	readonly alert: (alert: SourceAlert) => Promise<unknown>;
}

export function createSyncBusJob(deps: SyncBusDeps): JobDefinition {
	return {
		name: 'sync-bus',
		// 日本時間の毎日 5 時 30 分 (バスの時刻表の API は、版を毎日、停留所を 7 日に 1 回更新する)
		schedule: '30 5 * * *',
		timeoutMs: 10 * 60 * 1000,
		jitterMs: 10 * 60 * 1000,
		async run({ now, signal, manual }) {
			const at = now();
			if (isSourceDisabled(deps.disabledSources, BUS_SOURCE)) {
				return 'バスの時刻表の取得は、SOURCES_DISABLED で無効にされています';
			}
			const health = deps.health.load(BUS_SOURCE);
			// 手で動かしたときは、不調のあとの待ち時間を待たない (取得先は自前の API で、原因を直したあとにすぐ試したいため)
			if (!manual && !shouldAttempt(health, at)) {
				return `不調のあとの待ち時間なので、${health.nextAttemptAt?.toISOString() ?? ''} まで待っています`;
			}
			const run: SourceRun = {
				label: 'バスの時刻表',
				source: BUS_SOURCE,
				health,
				save: (next) => deps.health.save(BUS_SOURCE, next),
				alert: deps.alert,
				at,
				intervalMs: INTERVAL_MS,
			};

			const stored = deps.bus.getCatalog();
			const listResult = await deps.fetchCatalog(stored?.etag ?? null);
			let catalog: BusCatalog;
			if (listResult.kind === 'updated') {
				catalog = listResult.list;
				deps.bus.saveCatalog(catalog, listResult.etag, at);
			} else if (listResult.kind === 'not-modified' && stored) {
				catalog = stored.catalog;
				deps.bus.touchCatalog(at);
			} else if (listResult.kind === 'failed') {
				return failSource(run, listResult.message);
			} else if (listResult.kind === 'not-ready') {
				return failSource(run, 'バスの時刻表の API に、まだ時刻表がありません');
			} else {
				return failSource(
					run,
					'バスの時刻表の API が、保存した一覧がないのに「変更なし」を返しました',
				);
			}

			const counts = { updated: 0, unchanged: 0, missing: 0 };
			const failures: string[] = [];
			const total = catalog.stops.length * catalog.generations.length;
			for (const generation of catalog.generations) {
				for (const stop of catalog.stops) {
					if (signal.aborted) {
						failures.push('時間切れで、残りの取得をやめました');
						break;
					}
					const previous = deps.bus.getTimetable(stop.id, generation.code);
					const result = await deps.fetchTimetable({
						stopId: stop.id,
						generation: generation.code,
						etag: previous?.etag ?? null,
					});
					if (result.kind === 'updated') {
						deps.bus.saveTimetable(result.timetable, result.etag, at);
						counts.updated += 1;
					} else if (result.kind === 'not-modified') {
						deps.bus.touchTimetable(stop.id, generation.code, at);
						counts.unchanged += 1;
					} else if (result.kind === 'not-found') {
						counts.missing += 1;
					} else if (result.kind === 'failed') {
						failures.push(result.message);
					} else {
						failures.push(`${stop.name} の発車表が、まだありません`);
					}
				}
				if (signal.aborted) break;
			}

			deps.bus.pruneTimetables({
				generations: catalog.generations.map((generation) => generation.code),
				stopIds: catalog.stops.map((stop) => stop.id),
			});
			if (failures.length > 0) {
				return failSource(
					run,
					`発車表 ${failures.length} 件を取り込めませんでした (全 ${total} 件): ${failures[0]}`,
				);
			}
			await succeedSource(run);
			const summary =
				`停留所 ${catalog.stops.length} か所、版 ${catalog.generations.length} 件の発車表 ${total} 件を確かめました ` +
				`(更新 ${counts.updated} 件、変更なし ${counts.unchanged} 件)`;
			return counts.missing > 0
				? `${summary}。サーバーに ${counts.missing} 件の発車表がありません`
				: summary;
		},
	};
}
