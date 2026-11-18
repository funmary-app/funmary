import { describe, expect, it } from 'vitest';
import { detectChanges, type ScrapedChange, type TrackedChange } from './change-detection.ts';

const TODAY = '2026-10-01';

const scraped = (over: Partial<ScrapedChange> = {}): ScrapedChange => ({
	kind: 'cancellation',
	date: '2026-10-05',
	period: 2,
	lessonName: '線形代数 I',
	teacher: null,
	campus: null,
	room: null,
	fromRoom: null,
	comment: null,
	makeupPlan: null,
	...over,
});

const tracked = (over: Partial<TrackedChange> = {}): TrackedChange => ({
	...scraped(),
	missingCount: 0,
	withdrawn: false,
	...over,
});

describe('detectChanges: 新規', () => {
	it('前回になかった項目は、新規のイベントにする', () => {
		const result = detectChanges({ previous: [], scraped: [scraped()], today: TODAY });
		expect(result.kind).toBe('ok');
		if (result.kind !== 'ok') return;
		expect(result.events).toEqual([{ type: 'created', change: tracked() }]);
		expect(result.next).toEqual([tracked()]);
	});

	it('変わっていない項目は、イベントを出さない', () => {
		const result = detectChanges({ previous: [tracked()], scraped: [scraped()], today: TODAY });
		expect(result).toMatchObject({ kind: 'ok', events: [] });
	});
});

describe('detectChanges: 変更', () => {
	it('同じ授業 (種類、日付、時限、授業名) の教室やコメントが変わったら、変更のイベントにする', () => {
		const previous = tracked({ kind: 'roomChange', fromRoom: '401', room: '402' });
		const now = scraped({ kind: 'roomChange', fromRoom: '401', room: '501' });
		const result = detectChanges({ previous: [previous], scraped: [now], today: TODAY });
		if (result.kind !== 'ok') throw new Error('ok のはず');
		expect(result.events).toEqual([
			{ type: 'updated', change: { ...now, missingCount: 0, withdrawn: false }, before: previous },
		]);

		const comment = detectChanges({
			previous: [tracked({ comment: '補講未定' })],
			scraped: [scraped({ comment: '補講あり' })],
			today: TODAY,
		});
		expect(comment).toMatchObject({ kind: 'ok', events: [{ type: 'updated' }] });
	});
});

describe('detectChanges: 取り消し', () => {
	it('未来の日付の項目が 1 回消えただけでは、取り消しにしない (回数だけ数える)', () => {
		const result = detectChanges({ previous: [tracked()], scraped: [], today: TODAY });
		if (result.kind !== 'ok') throw new Error('ok のはず');
		expect(result.events).toEqual([]);
		expect(result.next).toEqual([tracked({ missingCount: 1 })]);
	});

	it('2 回続けて消えたら、取り消しのイベントにし、取り消し済みとして残す', () => {
		const result = detectChanges({
			previous: [tracked({ missingCount: 1 })],
			scraped: [],
			today: TODAY,
		});
		if (result.kind !== 'ok') throw new Error('ok のはず');
		expect(result.events).toEqual([
			{ type: 'withdrawn', change: tracked({ missingCount: 2, withdrawn: true }) },
		]);
		expect(result.next).toEqual([tracked({ missingCount: 2, withdrawn: true })]);
	});

	it('1 回消えたあとに載り直したら、数え直す (誤通知を出さない)', () => {
		const result = detectChanges({
			previous: [tracked({ missingCount: 1 })],
			scraped: [scraped()],
			today: TODAY,
		});
		if (result.kind !== 'ok') throw new Error('ok のはず');
		expect(result.events).toEqual([]);
		expect(result.next).toEqual([tracked({ missingCount: 0 })]);
	});

	it('過去の日付の項目が一覧から消えても、取り消しにしない (日が過ぎたので載らなくなっただけ)', () => {
		const past = tracked({ date: '2026-09-20' });
		const result = detectChanges({ previous: [past], scraped: [], today: TODAY });
		if (result.kind !== 'ok') throw new Error('ok のはず');
		expect(result.events).toEqual([]);
		expect(result.next).toEqual([past]);
	});

	it('取り消したあとに載り直したら、新規として扱う', () => {
		const result = detectChanges({
			previous: [tracked({ missingCount: 2, withdrawn: true })],
			scraped: [scraped()],
			today: TODAY,
		});
		if (result.kind !== 'ok') throw new Error('ok のはず');
		expect(result.events).toEqual([{ type: 'created', change: tracked() }]);
	});

	it('取り消し済みの項目は、消えたままでも、また取り消しのイベントを出さない', () => {
		const done = tracked({ missingCount: 2, withdrawn: true });
		const result = detectChanges({ previous: [done], scraped: [], today: TODAY });
		if (result.kind !== 'ok') throw new Error('ok のはず');
		expect(result.events).toEqual([]);
		expect(result.next).toEqual([done]);
	});
});

describe('detectChanges: 件数の急な減少', () => {
	const many = (n: number) =>
		Array.from({ length: n }, (_, i) => tracked({ period: (i % 6) + 1, lessonName: `授業 ${i}` }));

	it('今回が半分未満なら、更新を見送り、前回と今回の件数を伝える', () => {
		expect(detectChanges({ previous: many(12), scraped: [], today: TODAY }).kind).toBe(
			'suspicious',
		);
		expect(detectChanges({ previous: many(12), scraped: many(5), today: TODAY })).toEqual({
			kind: 'suspicious',
			reason: '今日以降の項目が前回の 12 件から 5 件に減ったため、更新を見送りました。',
		});
	});

	it('半分以上残っていれば、ふつうに更新する', () => {
		expect(detectChanges({ previous: many(12), scraped: many(6), today: TODAY }).kind).toBe('ok');
	});

	it('前回が 10 件に満たなければ、0 件になっても不審とはしない (少ないときは自然に 0 になる)', () => {
		expect(detectChanges({ previous: many(9), scraped: [], today: TODAY }).kind).toBe('ok');
	});

	it('取り消し済みや過去の日付の項目は、前回の件数に数えない', () => {
		const old = Array.from({ length: 12 }, (_, i) =>
			tracked({ date: '2026-09-01', lessonName: `過去 ${i}` }),
		);
		expect(detectChanges({ previous: old, scraped: [], today: TODAY }).kind).toBe('ok');
	});
});

describe('detectChanges: 年を固定しない', () => {
	it('どの年度の日付でも同じ規則で動く', () => {
		for (const year of [2026, 2035, 2049]) {
			const item = scraped({ date: `${year}-06-10` });
			const first = detectChanges({ previous: [], scraped: [item], today: `${year}-06-01` });
			expect(first).toMatchObject({ kind: 'ok', events: [{ type: 'created' }] });
			const gone1 = detectChanges({
				previous: [{ ...item, missingCount: 0, withdrawn: false }],
				scraped: [],
				today: `${year}-06-02`,
			});
			expect(gone1).toMatchObject({ kind: 'ok', events: [] });
		}
	});
});
