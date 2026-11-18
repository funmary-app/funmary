import { INITIAL_SOURCE_HEALTH, type SourceHealth } from '@funmary/core';
import { createLogger } from '@funmary/log';
import type { FetchSyllabusResult, SyllabusDetail, SyllabusListRow } from '@funmary/sources';
import { describe, expect, it, vi } from 'vitest';
import {
	createImportSyllabusJob,
	SYLLABUS_SOURCE,
	type ImportSyllabusDeps,
} from './import-syllabus.ts';
import type { JobContext } from './runner.ts';

/** 2026-09-26 (日本時間)。年度は 2026 */
const NOW = new Date('2026-09-26T03:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const row = (id: string): SyllabusListRow => ({
	lessonId: id,
	year: 2026,
	name: `科目 ${id}`,
	courseEnglish: null,
	teacher: '教員',
	lessonType: '講義',
});

const detail = (name = '科目'): SyllabusDetail => ({
	name,
	teacher: '教員',
	credits: 2,
	term: 'fall',
	attributes: new Map([['配当年次', '1年']]),
	sections: new Map([['授業の概要', '概要']]),
});

function setup(
	options: {
		result?: FetchSyllabusResult | ((year: number) => FetchSyllabusResult);
		health?: SourceHealth;
		stored?: Map<string, Date>;
		latestYear?: number | null;
		disabled?: string[];
		now?: Date;
	} = {},
) {
	let health = options.health ?? INITIAL_SOURCE_HEALTH;
	const upserts: { academicYear: number; syllabusId: string; name: string; term: string }[] = [];
	const alerts: { severity: string; title: string; message?: string }[] = [];
	const needs: ((row: SyllabusListRow) => boolean)[] = [];
	const years: number[] = [];
	const fetchCatalog = vi.fn<ImportSyllabusDeps['fetchCatalog']>((input) => {
		years.push(input.academicYear);
		needs.push(input.needsDetail);
		const result = options.result ?? {
			kind: 'ok',
			year: input.academicYear,
			entries: [{ row: row('1'), detail: detail() }],
			failedDetails: 0,
			failedEntries: [],
		};
		return Promise.resolve(typeof result === 'function' ? result(input.academicYear) : result);
	});
	const deps: ImportSyllabusDeps = {
		fetchCatalog,
		disabledSources: options.disabled ?? [],
		health: {
			load: () => health,
			save: (_source, next) => {
				health = next;
			},
		},
		subjects: {
			updatedAtBySyllabus: () => options.stored ?? new Map(),
			upsert: (input) => {
				upserts.push(input);
				return upserts.length;
			},
			latestYear: () => options.latestYear ?? null,
		},
		alert: (alert) => {
			alerts.push(alert);
			return Promise.resolve();
		},
	};
	const context: JobContext = {
		signal: new AbortController().signal,
		now: () => options.now ?? NOW,
		log: createLogger({ level: 'error', format: 'text', mode: 'development' }),
	};
	return {
		job: createImportSyllabusJob(deps),
		context,
		fetchCatalog,
		upserts,
		alerts,
		needs,
		years,
		health: () => health,
	};
}

describe('公開シラバスの定期処理', () => {
	it('毎日、日本時間の 5 時に動く', () => {
		const { job } = setup();
		expect(job.name).toBe('import-syllabus');
		expect(job.schedule).toBe('0 5 * * *');
	});

	it('取得した科目を年度とシラバスの番号で保存し、取得の成功を記録する', async () => {
		const t = setup();
		const message = await t.job.run(t.context);
		expect(t.upserts).toEqual([
			expect.objectContaining({ academicYear: 2026, syllabusId: '1', term: 'fall' }),
		]);
		expect(t.health().lastSuccessAt).toEqual(NOW);
		expect(message).toContain('2026');
	});

	it('保存する内容に、表の項目、本文の項目、シラバスの URL を含める', async () => {
		const seen: unknown[] = [];
		const t = setup();
		const original = t.fetchCatalog.getMockImplementation()!;
		t.fetchCatalog.mockImplementation(original);
		await t.job.run(t.context);
		seen.push(t.upserts[0]);
		expect(seen[0]).toMatchObject({
			attributes: { 配当年次: '1年' },
			syllabus: { 授業の概要: '概要' },
			syllabusUrl: 'https://students.fun.ac.jp/Lesson/Syllabus?lesson_id=1&year=2026',
		});
	});

	it('詳細は、未取得の科目と、30 日以上前に取った科目だけ取り直す', async () => {
		const stored = new Map([
			['fresh', new Date(NOW.getTime() - 20 * DAY)],
			['stale', new Date(NOW.getTime() - 31 * DAY)],
		]);
		const t = setup({ stored });
		await t.job.run(t.context);
		const needsDetail = t.needs[0]!;
		expect(needsDetail(row('fresh'))).toBe(false);
		expect(needsDetail(row('stale'))).toBe(true);
		expect(needsDetail(row('new'))).toBe(true);
	});

	describe('取得の頻度 (#122)', () => {
		const healthAt = (lastSuccessAt: Date): SourceHealth => ({
			...INITIAL_SOURCE_HEALTH,
			lastSuccessAt,
		});
		const stored = new Map([['1', new Date(NOW.getTime() - DAY)]]);

		it('前回の成功から 6 日たっていなければ、取りに行かない', async () => {
			const t = setup({ health: healthAt(new Date(NOW.getTime() - 3 * DAY)), stored });
			const message = await t.job.run(t.context);
			expect(t.fetchCatalog).not.toHaveBeenCalled();
			expect(message).toContain('待ちます');
		});

		it('前回の成功から 6 日以上たっていれば、取りに行く', async () => {
			const t = setup({ health: healthAt(new Date(NOW.getTime() - 6 * DAY)), stored });
			await t.job.run(t.context);
			expect(t.fetchCatalog).toHaveBeenCalledTimes(1);
		});

		it('今年度の科目が 1 件もなければ、前回の成功が新しくても取りに行く', async () => {
			const t = setup({ health: healthAt(new Date(NOW.getTime() - DAY)) });
			await t.job.run(t.context);
			expect(t.fetchCatalog).toHaveBeenCalledTimes(1);
		});

		it('新年度の公開を待つ時期 (3 月 1 日から 4 月 15 日) は、毎日取りに行く', async () => {
			const march = new Date('2027-03-10T03:00:00Z');
			const t = setup({ health: healthAt(new Date(march.getTime() - DAY)), stored, now: march });
			await t.job.run(t.context);
			expect(t.fetchCatalog).toHaveBeenCalledTimes(1);
		});

		it('4 月 16 日からは、また週に 1 回にする', async () => {
			const april = new Date('2027-04-16T03:00:00Z');
			const t = setup({ health: healthAt(new Date(april.getTime() - DAY)), stored, now: april });
			await t.job.run(t.context);
			expect(t.fetchCatalog).not.toHaveBeenCalled();
		});
	});

	it('新年度がまだなければ、前年度を取り込む', async () => {
		const t = setup({
			result: (year) =>
				year === 2026
					? { kind: 'year-unavailable', availableYears: [2025] }
					: {
							kind: 'ok',
							year,
							entries: [{ row: { ...row('9'), year }, detail: detail() }],
							failedDetails: 0,
							failedEntries: [],
						},
		});
		const message = await t.job.run(t.context);
		expect(t.years).toEqual([2026, 2025]);
		expect(t.upserts[0]).toMatchObject({ academicYear: 2025, syllabusId: '9' });
		expect(message).toContain('まだ');
	});

	it('新年度も前年度もなければ、失敗にする', async () => {
		const t = setup({ result: { kind: 'year-unavailable', availableYears: [2020] } });
		await expect(t.job.run(t.context)).rejects.toThrow();
		expect(t.health().consecutiveFailures).toBe(1);
	});

	it('詳細を取らなかった科目は、保存しない (詳細のない科目を作らない)', async () => {
		const t = setup({
			result: {
				kind: 'ok',
				year: 2026,
				entries: [
					{ row: row('1'), detail: null },
					{ row: row('2'), detail: detail() },
				],
				failedDetails: 0,
				failedEntries: [],
			},
		});
		await t.job.run(t.context);
		expect(t.upserts.map((u) => u.syllabusId)).toEqual(['2']);
	});

	it('詳細の失敗が 2 割を超えたら、保存はして、管理者に知らせる。授業名と理由を添える', async () => {
		const entries = Array.from({ length: 10 }, (_, i) => ({
			row: row(String(i)),
			detail: i < 7 ? detail() : null,
		}));
		const failedEntries = [
			{ lessonId: '7', name: '科目 7', reason: '授業名がありません' },
			{ lessonId: '8', name: '科目 8', reason: '授業名がありません' },
			{ lessonId: '9', name: '科目 9', reason: '授業名がありません' },
		];
		const t = setup({
			result: { kind: 'ok', year: 2026, entries, failedDetails: 3, failedEntries },
		});
		await t.job.run(t.context);
		expect(t.upserts).toHaveLength(7);
		const warning = t.alerts.find((a) => a.severity === 'warn');
		expect(warning?.message).toContain('科目 7 (授業名がありません)');
	});

	it('取得に失敗したら、失敗を数えて例外にする', async () => {
		const t = setup({ result: { kind: 'failed', message: '通信できませんでした' } });
		await expect(t.job.run(t.context)).rejects.toThrow('通信できませんでした');
		expect(t.health().consecutiveFailures).toBe(1);
		expect(t.upserts).toHaveLength(0);
	});

	it('構造が変わったら、保存せず、すぐ管理者に知らせる', async () => {
		const t = setup({ result: { kind: 'structure-changed', message: '形が変わりました' } });
		await expect(t.job.run(t.context)).rejects.toThrow();
		expect(t.alerts.map((a) => a.severity)).toContain('error');
		expect(t.upserts).toHaveLength(0);
	});

	it('取得元が無効なら、何もしない', async () => {
		const t = setup({ disabled: [SYLLABUS_SOURCE] });
		const message = await t.job.run(t.context);
		expect(t.fetchCatalog).not.toHaveBeenCalled();
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
		await t.job.run(t.context);
		expect(t.fetchCatalog).not.toHaveBeenCalled();
	});
});
