import type { CalendarDate } from './calendar-date.ts';

export type ChangeKind = 'cancellation' | 'makeup' | 'roomChange';

/** 今回取得した、休講、補講、教室変更の 1 件 */
export interface ScrapedChange {
	readonly kind: ChangeKind;
	readonly date: CalendarDate;
	readonly period: number;
	/** ポータルの表記のままの授業名 */
	readonly lessonName: string;
	readonly teacher: string | null;
	readonly campus: string | null;
	/** 補講の教室、または教室変更の移動先 */
	readonly room: string | null;
	/** 教室変更の移動元 */
	readonly fromRoom: string | null;
	readonly comment: string | null;
	readonly makeupPlan: 'planned' | 'none' | 'undecided' | null;
}

/** 前回までに記録した 1 件 */
export interface TrackedChange extends ScrapedChange {
	/** 一覧から続けて消えた回数。2 回で取り消しとみなす */
	readonly missingCount: number;
	readonly withdrawn: boolean;
}

export type ChangeEvent =
	| { readonly type: 'created'; readonly change: TrackedChange }
	| { readonly type: 'updated'; readonly change: TrackedChange; readonly before: TrackedChange }
	| { readonly type: 'withdrawn'; readonly change: TrackedChange };

export type DetectResult =
	| {
			readonly kind: 'ok';
			readonly events: readonly ChangeEvent[];
			/** 次に記録する内容 (前回の全件のうち残すものと、今回の全件) */
			readonly next: readonly TrackedChange[];
	  }
	| {
			/** 件数が急に減った。ログインの失敗かページ構造の変更とみなし、DB を更新しない */
			readonly kind: 'suspicious';
			readonly reason: string;
	  };

/** 何回続けて一覧から消えたら取り消しとみなすか */
export const WITHDRAW_AFTER = 2;
/** 前回の未来の項目がこの件数以上あるときだけ、件数の急な減少を疑う */
export const SUSPICIOUS_MIN_PREVIOUS = 10;

const keyOf = (change: ScrapedChange) =>
	`${change.kind}\u0000${change.date}\u0000${change.period}\u0000${change.lessonName}`;

const CONTENT_FIELDS = [
	'teacher',
	'campus',
	'room',
	'fromRoom',
	'comment',
	'makeupPlan',
] as const satisfies readonly (keyof ScrapedChange)[];

function contentChanged(before: ScrapedChange, after: ScrapedChange): boolean {
	return CONTENT_FIELDS.some((field) => before[field] !== after[field]);
}

export function detectChanges(input: {
	readonly previous: readonly TrackedChange[];
	readonly scraped: readonly ScrapedChange[];
	readonly today: CalendarDate;
}): DetectResult {
	const { previous, scraped, today } = input;

	// 件数の急な減少。取り消し済みと過去の日付は、自然に載らなくなるので数えない
	const previousActive = previous.filter((c) => !c.withdrawn && c.date >= today);
	const scrapedFuture = scraped.filter((c) => c.date >= today);
	if (
		previousActive.length >= SUSPICIOUS_MIN_PREVIOUS &&
		scrapedFuture.length < previousActive.length / 2
	) {
		return {
			kind: 'suspicious',
			reason: `今日以降の項目が前回の ${previousActive.length} 件から ${scrapedFuture.length} 件に減ったため、更新を見送りました。`,
		};
	}

	const events: ChangeEvent[] = [];
	const next: TrackedChange[] = [];
	const previousByKey = new Map(previous.map((c) => [keyOf(c), c]));
	const seen = new Set<string>();

	for (const item of scraped) {
		const key = keyOf(item);
		seen.add(key);
		const before = previousByKey.get(key);
		const current: TrackedChange = { ...item, missingCount: 0, withdrawn: false };
		next.push(current);
		if (!before || before.withdrawn) {
			// 取り消したあとに載り直した場合も、新規として知らせる
			events.push({ type: 'created', change: current });
		} else if (contentChanged(before, item)) {
			events.push({ type: 'updated', change: current, before });
		}
	}

	for (const before of previous) {
		if (seen.has(keyOf(before))) continue;
		if (before.withdrawn || before.date < today) {
			// 取り消し済みか、日が過ぎて載らなくなっただけ。そのまま残す
			next.push(before);
			continue;
		}
		const missingCount = before.missingCount + 1;
		if (missingCount >= WITHDRAW_AFTER) {
			const withdrawn: TrackedChange = { ...before, missingCount, withdrawn: true };
			next.push(withdrawn);
			events.push({ type: 'withdrawn', change: withdrawn });
		} else {
			next.push({ ...before, missingCount });
		}
	}

	return { kind: 'ok', events, next };
}
