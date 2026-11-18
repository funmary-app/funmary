// 学生ポータルの休講、補講、教室変更を取得して記録する定期処理。
// 取得結果を記録し、不調への移行を管理者に知らせる。取得に成功したら監視サービスにも通知する。
// 外との通信と保存は、すべて deps で受け取る (テストで差し替えられる)。
import { createHash } from 'node:crypto';
import {
	detectChanges,
	isSourceDisabled,
	isUnhealthy,
	matchLessonNames,
	shouldAttempt,
	type ChangeEvent,
	type ScrapedChange,
	type SourceHealth,
	type SubjectName,
	type TrackedChange,
} from '@funmary/core';
import {
	PORTAL_MIN_INTERVAL_MS,
	parseClassChangePage,
	type FetchPortalResult,
	type ParseResult,
} from '@funmary/sources';
import type { JobDefinition } from './runner.ts';
import { failSource, japanDate, succeedSource, type SourceRun } from './source-run.ts';

/** SOURCES_DISABLED と source_status で使う、取得元の名前 */
export const PORTAL_SOURCE = 'portal';

export interface ScrapePortalDeps {
	/** ポータルから一覧の HTML を取得する。lastAttemptAt を、間隔の下限の確認に使う */
	readonly fetchPage: (lastAttemptAt: Date | null) => Promise<FetchPortalResult>;
	/** SOURCES_DISABLED */
	readonly disabledSources: readonly string[];
	readonly health: {
		load(source: string): SourceHealth;
		save(source: string, health: SourceHealth): void;
	};
	readonly changes: {
		load(): TrackedChange[];
		apply(next: readonly TrackedChange[], now: Date): void;
	};
	/** 管理者への知らせ。秘密の値を含めない */
	readonly alert: (alert: {
		severity: 'info' | 'warn' | 'error';
		title: string;
		message?: string;
		key?: string;
	}) => Promise<unknown>;
	/** 新規、変更、取り消しを、通知の仕組みに渡す (利用者への通知は別に作る) */
	readonly onEvents?: (events: readonly ChangeEvent[]) => void | Promise<void>;
	/** 取得が成功したときに、監視サービス (HEARTBEAT_URL) に知らせる。失敗しても、処理の結果には影響しない */
	readonly heartbeat?: () => Promise<unknown>;
	/** 授業名と科目の照合。科目は、履修登録と同じく、保存されている最新の年度のものを使う */
	readonly matching?: {
		unassignedLessonNames(): string[];
		assignSubject(lessonName: string, subjectId: number): number;
		latestSubjectYear(): number | null;
		subjects(academicYear: number): readonly SubjectName[];
		/** 管理者が手で紐付けた名前 */
		resolvedNames(academicYear: number): ReadonlyMap<string, number>;
		/** 照合できなかった名前を記録し、新しく記録した数を返す */
		recordUnmatched(academicYear: number, lessonNames: readonly string[], now: Date): number;
	};
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

function toScraped(parsed: Extract<ParseResult, { kind: 'ok' }>): ScrapedChange[] {
	return [
		...parsed.cancellations.map((c): ScrapedChange => ({
			kind: 'cancellation',
			date: c.date,
			period: c.period,
			lessonName: c.lessonName,
			teacher: c.teacher,
			campus: c.campus,
			room: null,
			fromRoom: null,
			comment: c.comment,
			makeupPlan: c.makeupPlan,
		})),
		...parsed.makeups.map((m): ScrapedChange => ({
			kind: 'makeup',
			date: m.date,
			period: m.period,
			lessonName: m.lessonName,
			teacher: m.teacher,
			campus: m.campus,
			room: m.room,
			fromRoom: null,
			comment: m.comment,
			makeupPlan: null,
		})),
		...parsed.roomChanges.map((r): ScrapedChange => ({
			kind: 'roomChange',
			date: r.date,
			period: r.period,
			lessonName: r.lessonName,
			teacher: r.teacher,
			campus: r.campus,
			room: r.toRoom,
			fromRoom: r.fromRoom,
			comment: null,
			makeupPlan: null,
		})),
	];
}

/**
 * 科目が決まっていない休講などの授業名を照合し、科目を入れる。照合できなかった名前は記録し、新しいものがあれば管理者に知らせる。
 * 結果の要約 (照合できなかった名前がなければ空) を返す
 */
async function matchPending(
	matching: NonNullable<ScrapePortalDeps['matching']>,
	alert: ScrapePortalDeps['alert'],
	at: Date,
): Promise<string> {
	const academicYear = matching.latestSubjectYear();
	if (academicYear === null) return '';
	const names = matching.unassignedLessonNames();
	if (names.length === 0) return '';
	const result = matchLessonNames(
		names,
		matching.subjects(academicYear),
		matching.resolvedNames(academicYear),
	);
	for (const { lessonName, subjectId } of result.matched) {
		matching.assignSubject(lessonName, subjectId);
	}
	if (result.unmatched.length === 0) return '';
	const added = matching.recordUnmatched(academicYear, result.unmatched, at);
	if (added > 0) {
		await alert({
			severity: 'warn',
			title: '休講などの授業名を、科目と照合できませんでした',
			message: `管理画面で科目に紐付けてください: ${result.unmatched.join('、')}`,
			key: `unmatched-lessons:${result.unmatched.join(',')}`,
		});
	}
	return ` (科目と照合できなかった授業名 ${result.unmatched.length} 件)`;
}

export function createScrapePortalJob(deps: ScrapePortalDeps): JobDefinition {
	const match = (at: Date) =>
		deps.matching ? matchPending(deps.matching, deps.alert, at) : Promise.resolve('');
	return {
		name: 'scrape-portal',
		// 日本時間の 7 時、12 時、18 時
		schedule: '0 7,12,18 * * *',
		timeoutMs: 2 * 60 * 1000,
		// 時刻ぴったりに集中しないよう、最大 5 分ずらす
		jitterMs: 5 * 60 * 1000,
		async run({ now, log }) {
			const at = now();
			if (isSourceDisabled(deps.disabledSources, PORTAL_SOURCE)) {
				return 'ポータルの取得は、SOURCES_DISABLED で無効にされています';
			}
			const health = deps.health.load(PORTAL_SOURCE);
			if (!shouldAttempt(health, at)) {
				return `不調のあとの待ち時間なので、${health.nextAttemptAt?.toISOString() ?? ''} まで待っています`;
			}

			const run: SourceRun = {
				label: 'ポータル',
				source: PORTAL_SOURCE,
				health,
				save: (next) => deps.health.save(PORTAL_SOURCE, next),
				alert: deps.alert,
				at,
				intervalMs: PORTAL_MIN_INTERVAL_MS,
			};
			const fail = (message: string, alertNow?: { title: string }) =>
				failSource(run, message, alertNow);

			const page = await deps.fetchPage(health.lastAttemptAt);
			if (page.kind === 'throttled') {
				return `前回の試みから 60 分たっていないので、取得しません (${page.retryAt.toISOString()} 以降)`;
			}
			if (page.kind === 'structure-changed') {
				return fail(page.message, { title: 'ポータルのログイン画面の形が変わりました' });
			}
			if (page.kind !== 'ok') return fail(page.message);

			const contentHash = sha256(page.html);
			const done = async (summary: string) => {
				await succeedSource(run, { contentHash });
				// 監視サービスへの知らせは、失敗しても、取得の結果を変えない
				try {
					await deps.heartbeat?.();
				} catch (error) {
					log.withTag('portal').warn(`監視サービスへの知らせに失敗しました: ${String(error)}`);
				}
				return summary;
			};

			if (health.contentHash === contentHash && !isUnhealthy(health)) {
				// あとから取り込んだ科目や、管理者の紐付けを反映するため、内容が同じでも照合はする
				return done(`前回と同じ内容だったので、解析を省きました${await match(at)}`);
			}

			const { today, academicYear } = japanDate(at);
			const parsed = parseClassChangePage(page.html, { academicYear });
			if (parsed.kind === 'login-required') {
				return fail('ログインしたのに、ログイン画面に戻されました');
			}
			if (parsed.kind === 'structure-changed') {
				return fail(`休講一覧の構造が変わりました: ${parsed.reason}`, {
					title: 'ポータルの休講一覧の構造が変わりました',
				});
			}

			const detected = detectChanges({
				previous: deps.changes.load(),
				scraped: toScraped(parsed),
				today,
			});
			if (detected.kind === 'suspicious') {
				return fail(detected.reason, {
					title: 'ポータルの休講一覧の件数が急に減りました',
				});
			}

			deps.changes.apply(detected.next, at);
			// 通知先を科目で決められるよう、通知の仕組みに渡す前に照合する
			const unmatchedSummary = await match(at);
			await deps.onEvents?.(detected.events);
			const count = (type: ChangeEvent['type']) =>
				detected.events.filter((e) => e.type === type).length;
			return done(
				`新規 ${count('created')} 件、変更 ${count('updated')} 件、取り消し ${count('withdrawn')} 件` +
					(parsed.rejectedRows > 0 ? ` (形が合わず捨てた行 ${parsed.rejectedRows} 件)` : '') +
					unmatchedSummary,
			);
		},
	};
}
