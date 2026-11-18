import { readFileSync } from 'node:fs';
import {
	INITIAL_SOURCE_HEALTH,
	type ChangeEvent,
	type ScrapedChange,
	type SourceHealth,
	type TrackedChange,
} from '@funmary/core';
import { createLogger } from '@funmary/log';
import type { FetchPortalResult } from '@funmary/sources';
import { describe, expect, it, vi } from 'vitest';
import type { JobContext } from './runner.ts';
import { createScrapePortalJob, PORTAL_SOURCE, type ScrapePortalDeps } from './scrape-portal.ts';

const allKinds = readFileSync(
	new URL('../../sources/src/portal/fixtures/all-kinds.html', import.meta.url),
	'utf8',
);

/** 2026-09-15 12:00 (日本時間)。年度は 2026 */
const NOW = new Date('2026-09-15T03:00:00Z');

function setup(
	options: {
		page?: FetchPortalResult;
		health?: SourceHealth;
		previous?: TrackedChange[];
		disabled?: string[];
	} = {},
) {
	let health = options.health ?? INITIAL_SOURCE_HEALTH;
	const applied: TrackedChange[][] = [];
	const alerts: { severity: string; title: string; message?: string }[] = [];
	const events: ChangeEvent[][] = [];
	const pings: string[] = [];
	const page: FetchPortalResult = options.page ?? { kind: 'ok', html: allKinds };
	const fetchPage = vi.fn<ScrapePortalDeps['fetchPage']>(() => Promise.resolve(page));
	const deps: ScrapePortalDeps = {
		fetchPage,
		disabledSources: options.disabled ?? [],
		health: {
			load: () => health,
			save: (_source, next) => {
				health = next;
			},
		},
		changes: {
			load: () => options.previous ?? [],
			apply: (next) => {
				applied.push([...next]);
			},
		},
		alert: (alert) => {
			alerts.push(alert);
			return Promise.resolve();
		},
		onEvents: (list) => {
			events.push([...list]);
		},
		heartbeat: () => {
			pings.push('ping');
			return Promise.resolve();
		},
	};
	const context: JobContext = {
		signal: new AbortController().signal,
		now: () => NOW,
		log: createLogger({ level: 'error', format: 'text', mode: 'development' }),
	};
	const job = createScrapePortalJob(deps);
	return { job, context, deps, fetchPage, applied, alerts, events, pings, health: () => health };
}

describe('ポータルの定期処理', () => {
	it('日本時間の 7 時、12 時、18 時に動く', () => {
		const { job } = setup();
		expect(job.name).toBe('scrape-portal');
		expect(job.schedule).toBe('0 7,12,18 * * *');
	});

	it('休講情報を取り込み、変更と取得の成功を記録する', async () => {
		const t = setup();
		const message = await t.job.run(t.context);
		expect(t.applied).toHaveLength(1);
		expect(t.applied[0]!.length).toBeGreaterThan(0);
		expect(t.events[0]!.every((e) => e.type === 'created')).toBe(true);
		expect(t.health().consecutiveFailures).toBe(0);
		expect(t.health().lastSuccessAt).toEqual(NOW);
		expect(t.health().contentHash).toMatch(/^[0-9a-f]{64}$/);
		expect(message).toMatch(/新規 \d+ 件/);
	});

	it('成功したら、監視サービスに知らせる', async () => {
		const t = setup();
		await t.job.run(t.context);
		expect(t.pings).toHaveLength(1);
	});

	it('前回と同じ内容なら、解析と保存を省くが、成功として知らせる', async () => {
		const first = setup();
		await first.job.run(first.context);
		// 次の実行は、5 時間以上あとなので、60 分の待ちは過ぎている
		const t = setup({ health: { ...first.health(), nextAttemptAt: null } });
		const message = await t.job.run(t.context);
		expect(t.applied).toHaveLength(0);
		expect(message).toContain('前回と同じ');
		expect(t.pings).toHaveLength(1);
	});

	it('取得元が無効にされていたら、何もしない', async () => {
		const t = setup({ disabled: [PORTAL_SOURCE] });
		const message = await t.job.run(t.context);
		expect(t.fetchPage).not.toHaveBeenCalled();
		expect(message).toContain('無効');
	});

	it('不調で待っている間は、取得しない', async () => {
		const t = setup({
			health: {
				...INITIAL_SOURCE_HEALTH,
				consecutiveFailures: 3,
				nextAttemptAt: new Date(NOW.getTime() + 60_000),
			},
		});
		const message = await t.job.run(t.context);
		expect(t.fetchPage).not.toHaveBeenCalled();
		expect(message).toContain('待っています');
	});

	it('間隔の下限のため取得できなければ、失敗にせず、理由を返す', async () => {
		const t = setup({ page: { kind: 'throttled', retryAt: new Date(NOW.getTime() + 1000) } });
		const message = await t.job.run(t.context);
		expect(message).toContain('60 分');
		expect(t.health().consecutiveFailures).toBe(0);
		expect(t.pings).toHaveLength(0);
	});

	it('取得に失敗したら、失敗を数え、例外にして、監視サービスには知らせない', async () => {
		const t = setup({ page: { kind: 'failed', message: '通信できませんでした' } });
		await expect(t.job.run(t.context)).rejects.toThrow('通信できませんでした');
		expect(t.health().consecutiveFailures).toBe(1);
		expect(t.pings).toHaveLength(0);
		expect(t.applied).toHaveLength(0);
	});

	it('3 回続けて失敗したら、不調になった 1 回だけ管理者に知らせる', async () => {
		const t = setup({
			page: { kind: 'login-failed', message: 'ログインできませんでした' },
			health: { ...INITIAL_SOURCE_HEALTH, consecutiveFailures: 2 },
		});
		await expect(t.job.run(t.context)).rejects.toThrow();
		expect(t.alerts).toHaveLength(1);
		expect(t.alerts[0]!.title).toContain('不調');
		expect(JSON.stringify(t.alerts)).not.toContain('"p"');
	});

	it('ログイン画面の構造が変わったら、すぐ管理者に知らせる', async () => {
		const t = setup({ page: { kind: 'structure-changed', message: '形が変わりました' } });
		await expect(t.job.run(t.context)).rejects.toThrow();
		expect(t.alerts.map((a) => a.severity)).toContain('error');
	});

	it('一覧の構造が変わっていたら、保存せず、管理者に知らせる', async () => {
		const t = setup({ page: { kind: 'ok', html: '<html><body>変わった</body></html>' } });
		await expect(t.job.run(t.context)).rejects.toThrow();
		expect(t.applied).toHaveLength(0);
		expect(t.alerts).toHaveLength(1);
		expect(t.health().consecutiveFailures).toBe(1);
	});

	it('件数が急に減ったら、保存せず、管理者に知らせる', async () => {
		const many: TrackedChange[] = Array.from({ length: 12 }, (_, i) => ({
			kind: 'cancellation' as const,
			date: '2026-09-20',
			period: 1,
			lessonName: `科目 ${i}`,
			teacher: null,
			campus: null,
			room: null,
			fromRoom: null,
			comment: null,
			makeupPlan: null,
			missingCount: 0,
			withdrawn: false,
		}));
		const empty =
			'<html><body><h4 id="cancel-lecture-information">休講情報</h4><h4 id="sup-lecture-information">補講情報</h4><h4 id="classroom-exchanged-lecture-information">教室変更情報</h4></body></html>';
		const t = setup({ page: { kind: 'ok', html: empty }, previous: many });
		await expect(t.job.run(t.context)).rejects.toThrow();
		expect(t.applied).toHaveLength(0);
		expect(t.alerts).toHaveLength(1);
	});

	it('一覧が空でも、構造が正しければ、成功として扱う', async () => {
		const empty =
			'<html><body><h4 id="cancel-lecture-information">休講情報</h4><h4 id="sup-lecture-information">補講情報</h4><h4 id="classroom-exchanged-lecture-information">教室変更情報</h4></body></html>';
		const t = setup({ page: { kind: 'ok', html: empty } });
		await t.job.run(t.context);
		expect(t.pings).toHaveLength(1);
		expect(t.health().consecutiveFailures).toBe(0);
	});

	it('取得する時の最後の試みの時刻を、間隔の下限の確認に渡す', async () => {
		const last = new Date('2026-09-15T02:30:00Z');
		const t = setup({ health: { ...INITIAL_SOURCE_HEALTH, lastAttemptAt: last } });
		await t.job.run(t.context);
		expect(t.fetchPage).toHaveBeenCalledWith(last);
	});

	it('変更の内容を ScrapedChange にして渡す', async () => {
		const t = setup();
		await t.job.run(t.context);
		const kinds = new Set<ScrapedChange['kind']>(t.applied[0]!.map((c) => c.kind));
		expect(kinds.size).toBeGreaterThan(0);
	});
});

describe('授業名と科目の照合', () => {
	function withMatching(
		options: { names?: string[]; latestYear?: number | null; resolved?: Map<string, number> } = {},
		base: Parameters<typeof setup>[0] = {},
	) {
		const t = setup(base);
		const assigned: [string, number][] = [];
		const recorded: { year: number; names: readonly string[] }[] = [];
		const order: string[] = [];
		const matching: NonNullable<ScrapePortalDeps['matching']> = {
			unassignedLessonNames: () => {
				order.push('match');
				return options.names ?? ['情報処理演習Ⅰ', '英語 I', '架空の知らない授業'];
			},
			assignSubject: (name, id) => {
				assigned.push([name, id]);
				return 1;
			},
			latestSubjectYear: () => (options.latestYear === undefined ? 2026 : options.latestYear),
			subjects: () => [
				{ id: 10, name: '情報処理演習Ⅰ' },
				{ id: 11, name: '英語 I' },
			],
			resolvedNames: () => options.resolved ?? new Map(),
			recordUnmatched: (year, names) => {
				recorded.push({ year, names });
				return names.length;
			},
		};
		const onEvents = t.deps.onEvents;
		const job = createScrapePortalJob({
			...t.deps,
			matching,
			onEvents: (events) => {
				order.push('events');
				return onEvents?.(events);
			},
		});
		return { ...t, job, assigned, recorded, order };
	}

	it('科目が決まっていない授業名を照合して科目を入れ、照合できなかった名前を記録して知らせる', async () => {
		const t = withMatching();
		const message = await t.job.run(t.context);
		expect(t.assigned).toEqual([
			['情報処理演習Ⅰ', 10],
			['英語 I', 11],
		]);
		expect(t.recorded).toEqual([{ year: 2026, names: ['架空の知らない授業'] }]);
		expect(t.alerts).toContainEqual(
			expect.objectContaining({
				severity: 'warn',
				title: '休講などの授業名を、科目と照合できませんでした',
				message: expect.stringContaining('架空の知らない授業') as string,
			}),
		);
		expect(message).toContain('科目と照合できなかった授業名 1 件');
	});

	it('通知の仕組みに渡す前に照合する (科目で送り先を決められるように)', async () => {
		const t = withMatching();
		await t.job.run(t.context);
		expect(t.order).toEqual(['match', 'events']);
	});

	it('既に記録した名前だけなら、管理者には知らせない', async () => {
		const t = withMatching();
		t.job = createScrapePortalJob({
			...t.deps,
			matching: {
				unassignedLessonNames: () => ['架空の知らない授業'],
				assignSubject: () => 0,
				latestSubjectYear: () => 2026,
				subjects: () => [{ id: 10, name: '情報処理演習Ⅰ' }],
				resolvedNames: () => new Map(),
				recordUnmatched: () => 0,
			},
		});
		await t.job.run(t.context);
		expect(t.alerts).toEqual([]);
	});

	it('前回と同じ内容でも照合する (あとから取り込んだ科目や、管理者の紐付けを反映するため)', async () => {
		const first = setup();
		await first.job.run(first.context);
		const t = withMatching(
			{ names: ['架空の別名'], resolved: new Map([['架空の別名', 11]]) },
			{ health: { ...first.health(), nextAttemptAt: null } },
		);
		const message = await t.job.run(t.context);
		expect(message).toContain('前回と同じ');
		expect(t.assigned).toEqual([['架空の別名', 11]]);
	});

	it('科目をまだ取り込んでいなければ、照合しない', async () => {
		const t = withMatching({ latestYear: null });
		await t.job.run(t.context);
		expect(t.assigned).toEqual([]);
		expect(t.recorded).toEqual([]);
	});
});
