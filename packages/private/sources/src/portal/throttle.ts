// 学生ポータルへの取得の間隔の下限。
// 取得の間隔は最短 60 分とし、設定では縮められないようにコードに組み込む。リポジトリを公開するので、他人がこのコードを動かしてもポータルに負荷をかけないようにしておく。
// ポータルに接続する処理は、必ず接続の前に portalAttemptAllowed を通し、間隔の設定は clampPortalInterval を通す。

export const PORTAL_MIN_INTERVAL_MS = 60 * 60 * 1000;

/** 指定された取得の間隔を、下限より短くならないようにする */
export function clampPortalInterval(requestedMs: number): number {
	return Math.max(requestedMs, PORTAL_MIN_INTERVAL_MS);
}

export type AttemptDecision =
	{ readonly allowed: true } | { readonly allowed: false; readonly retryAt: Date };

/**
 * 接続してよいか。lastAttemptAt には、前回接続を試みた時刻を渡す (成功でも失敗でも。失敗のあとにすぐ再試行しないため)
 */
export function portalAttemptAllowed(lastAttemptAt: Date | null, now: Date): AttemptDecision {
	if (lastAttemptAt === null) return { allowed: true };
	const retryAt = new Date(lastAttemptAt.getTime() + PORTAL_MIN_INTERVAL_MS);
	return now.getTime() >= retryAt.getTime() ? { allowed: true } : { allowed: false, retryAt };
}
