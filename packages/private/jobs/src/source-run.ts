// 取得元 (ポータル、公開シラバスなど) の定期処理に共通の部品。
// 失敗を数えて保存し、不調になった 1 回だけ管理者に知らせて例外にする。成功は、回復したときだけ知らせる。
import { recordFailure, recordSuccess, type SourceHealth } from '@funmary/core';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日本時間の日付 (YYYY-MM-DD) と、年度 (4 月から 3 月まで) */
export function japanDate(now: Date): { today: string; academicYear: number } {
	const jst = new Date(now.getTime() + JST_OFFSET_MS);
	const year = jst.getUTCFullYear();
	return {
		today: jst.toISOString().slice(0, 10),
		academicYear: jst.getUTCMonth() >= 3 ? year : year - 1,
	};
}

export interface SourceAlert {
	severity: 'info' | 'warn' | 'error';
	title: string;
	message?: string;
	key?: string;
}

export interface SourceRun {
	/** 表示に使う、取得元の名前 (例: ポータル) */
	readonly label: string;
	/** 通知の key の接頭辞と、source_status の名前 (例: portal) */
	readonly source: string;
	readonly health: SourceHealth;
	readonly save: (health: SourceHealth) => void;
	readonly alert: (alert: SourceAlert) => Promise<unknown>;
	readonly at: Date;
	readonly intervalMs: number;
}

/** 失敗を記録して、例外にする。alertNow があれば、不調になるのを待たずに、すぐ知らせる */
export async function failSource(
	run: SourceRun,
	message: string,
	alertNow?: { title: string },
): Promise<never> {
	const { health: next, becameUnhealthy } = recordFailure(run.health, run.at, message, {
		intervalMs: run.intervalMs,
	});
	run.save(next);
	if (alertNow) {
		await run.alert({
			severity: 'error',
			title: alertNow.title,
			message,
			key: `${run.source}:structure`,
		});
	} else if (becameUnhealthy) {
		await run.alert({
			severity: 'error',
			title: `${run.label}の取得が不調です (${next.consecutiveFailures} 回続けて失敗)`,
			message,
			key: `${run.source}:unhealthy`,
		});
	}
	throw new Error(message);
}

/** 成功を記録する。不調から回復したときは、管理者に知らせる */
export async function succeedSource(
	run: SourceRun,
	options: { contentHash?: string } = {},
): Promise<void> {
	const { health: next, recovered } = recordSuccess(run.health, run.at, {
		intervalMs: run.intervalMs,
		...options,
	});
	run.save(next);
	if (recovered) {
		await run.alert({
			severity: 'info',
			title: `${run.label}の取得が回復しました`,
			key: `${run.source}:recovered`,
		});
	}
}
