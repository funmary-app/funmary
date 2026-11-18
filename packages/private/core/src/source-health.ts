// 取得元の状態。外部の取得元ごとに、失敗を数えて、次に試す時刻を決める。
// I/O は持たない。今の時刻は引数で受け取り、結果は新しい状態として返す。
// 保存は @funmary/db の sourceHealthStore、実行は定期処理の仕組みが行う。

/** 何回続けて失敗したら "不調" とするか */
export const UNHEALTHY_AFTER = 3;
/** 不調の間の、次の試行までの間隔の上限 */
export const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;
const MAX_ERROR_LENGTH = 300;

export interface SourceHealth {
	readonly lastSuccessAt: Date | null;
	readonly lastAttemptAt: Date | null;
	readonly consecutiveFailures: number;
	readonly nextAttemptAt: Date | null;
	/** 直近の失敗の理由。秘密の値を含まないように、呼ぶ側で伏せてから渡す */
	readonly lastError: string | null;
	/** 前回取得した内容のハッシュ。同じなら解析を省く */
	readonly contentHash: string | null;
}

export const INITIAL_SOURCE_HEALTH: SourceHealth = {
	lastSuccessAt: null,
	lastAttemptAt: null,
	consecutiveFailures: 0,
	nextAttemptAt: null,
	lastError: null,
	contentHash: null,
};

export interface IntervalOptions {
	/** 通常の取得の間隔 */
	readonly intervalMs: number;
	/** 不調になる前の失敗のあとに、次を試すまでの間隔。省くと intervalMs */
	readonly retryMs?: number;
}

export function isUnhealthy(health: SourceHealth): boolean {
	return health.consecutiveFailures >= UNHEALTHY_AFTER;
}

/** 次の試行の時刻になっている (または一度も試していない) か */
export function shouldAttempt(health: SourceHealth, now: Date): boolean {
	return health.nextAttemptAt === null || now.getTime() >= health.nextAttemptAt.getTime();
}

/** SOURCES_DISABLED に書かれた取得元か */
export function isSourceDisabled(disabled: readonly string[], source: string): boolean {
	return disabled.includes(source);
}

export function recordSuccess(
	health: SourceHealth,
	now: Date,
	options: IntervalOptions & { readonly contentHash?: string },
): { readonly health: SourceHealth; readonly recovered: boolean } {
	return {
		health: {
			lastSuccessAt: now,
			lastAttemptAt: now,
			consecutiveFailures: 0,
			nextAttemptAt: new Date(now.getTime() + options.intervalMs),
			lastError: null,
			contentHash: options.contentHash ?? health.contentHash,
		},
		recovered: isUnhealthy(health),
	};
}

export function recordFailure(
	health: SourceHealth,
	now: Date,
	error: string,
	options: IntervalOptions,
): { readonly health: SourceHealth; readonly becameUnhealthy: boolean } {
	const consecutiveFailures = health.consecutiveFailures + 1;
	const delayMs =
		consecutiveFailures < UNHEALTHY_AFTER
			? (options.retryMs ?? options.intervalMs)
			: // 3 回目は 2 倍、4 回目は 4 倍と倍々にし、上限で止める
				Math.min(
					options.intervalMs * 2 ** (consecutiveFailures - UNHEALTHY_AFTER + 1),
					MAX_BACKOFF_MS,
				);
	return {
		health: {
			...health,
			lastAttemptAt: now,
			consecutiveFailures,
			nextAttemptAt: new Date(now.getTime() + delayMs),
			lastError: error.slice(0, MAX_ERROR_LENGTH),
		},
		// 不調になった、その 1 回だけ true にする。管理者への知らせを 1 回にするため
		becameUnhealthy: consecutiveFailures === UNHEALTHY_AFTER,
	};
}

/** 最後の取得の成功からこれだけたったら、画面で情報が古いと警告する */
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

/** 情報が古いか。一度も取得に成功していなければ古いとみなす */
export function isStale(lastSuccessAt: Date | null, now: Date): boolean {
	return lastSuccessAt === null || now.getTime() - lastSuccessAt.getTime() >= STALE_AFTER_MS;
}
