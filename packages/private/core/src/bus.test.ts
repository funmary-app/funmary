import { describe, expect, it } from 'vitest';
import {
	busDayType,
	generationForDate,
	upcomingDepartures,
	type BusGeneration,
	type BusPlatformTimetable,
} from './bus.ts';

// 2026-10-05 は月曜、2026-10-10 は土曜、2026-10-12 はスポーツの日 (祝日の月曜)
const holidays = new Set(['2026-10-12']);

function platform(
	day: BusPlatformTimetable['day'],
	times: readonly string[],
	overrides: Partial<BusPlatformTimetable> = {},
): BusPlatformTimetable {
	return {
		platformNo: 1,
		platformName: '1 番のりば',
		day,
		notes: [],
		departures: times.map((time) => ({ time, routes: ['55A'], marks: [] })),
		...overrides,
	};
}

describe('busDayType', () => {
	it('月曜から金曜は平日', () => {
		expect(busDayType('2026-10-05', holidays)).toBe('weekday');
		expect(busDayType('2026-10-09', holidays)).toBe('weekday');
	});

	it('土曜、日曜、祝日は休日', () => {
		expect(busDayType('2026-10-10', holidays)).toBe('holiday');
		expect(busDayType('2026-10-11', holidays)).toBe('holiday');
		expect(busDayType('2026-10-12', holidays)).toBe('holiday');
	});
});

describe('upcomingDepartures', () => {
	const timetables = [
		platform('weekday', ['08:05', '09:30', '12:00']),
		platform('holiday', ['10:00']),
	];

	it('今の時刻以降の発車を、近い順に limit 件まで返す', () => {
		const result = upcomingDepartures(timetables, {
			now: { date: '2026-10-05', time: '08:30' },
			holidays,
			limit: 2,
		});
		expect(
			result.map((item) => [item.serviceDate, item.departure.time, item.minutesUntil]),
		).toEqual([
			['2026-10-05', '09:30', 60],
			['2026-10-05', '12:00', 210],
		]);
	});

	it('ちょうど今の時刻の発車も含める', () => {
		const result = upcomingDepartures(timetables, {
			now: { date: '2026-10-05', time: '09:30' },
			holidays,
			limit: 1,
		});
		expect(result[0]?.minutesUntil).toBe(0);
	});

	it('土曜は休日の発車表を使う', () => {
		const result = upcomingDepartures(timetables, {
			now: { date: '2026-10-10', time: '07:00' },
			holidays,
			limit: 1,
		});
		expect(result.map((item) => item.departure.time)).toEqual(['10:00']);
	});

	it('今日の最後の発車を過ぎたら、翌日の始発から数える', () => {
		const result = upcomingDepartures(timetables, {
			now: { date: '2026-10-09', time: '23:00' },
			holidays,
			limit: 1,
		});
		// 翌日は土曜
		expect(result[0]).toMatchObject({ serviceDate: '2026-10-10', minutesUntil: 11 * 60 });
		expect(result[0]?.departure.time).toBe('10:00');
	});

	it('24 時以降の発車は、前日のダイヤの深夜便として、日付が変わったあとに拾う', () => {
		const late = [platform('weekday', ['24:10'])];
		const result = upcomingDepartures(late, {
			now: { date: '2026-10-06', time: '00:05' },
			holidays,
			limit: 1,
		});
		expect(result[0]).toMatchObject({ serviceDate: '2026-10-05', minutesUntil: 5 });
	});

	it('金曜の深夜便は、土曜になっても金曜のダイヤ(平日)で数える', () => {
		const late = [platform('weekday', ['24:10']), platform('holiday', ['09:00'])];
		const result = upcomingDepartures(late, {
			now: { date: '2026-10-10', time: '00:05' },
			holidays,
			limit: 1,
		});
		expect(result[0]).toMatchObject({ serviceDate: '2026-10-09', minutesUntil: 5 });
	});

	it('のりばが複数あれば、のりばを区別して、発車の順にまとめる', () => {
		const result = upcomingDepartures(
			[
				platform('weekday', ['09:00'], { platformNo: 2, platformName: '2 番のりば' }),
				platform('weekday', ['08:50']),
			],
			{ now: { date: '2026-10-05', time: '08:00' }, holidays, limit: 2 },
		);
		expect(result.map((item) => [item.platformNo, item.departure.time])).toEqual([
			[1, '08:50'],
			[2, '09:00'],
		]);
	});

	it('発車表が空なら空を返す', () => {
		expect(
			upcomingDepartures([], { now: { date: '2026-10-05', time: '08:00' }, holidays, limit: 3 }),
		).toEqual([]);
	});
});

describe('generationForDate', () => {
	const generations: BusGeneration[] = [
		{ code: 20261020, name: '令和8年10月20日', current: false },
		{ code: 20260401, name: '令和8年4月1日', current: false },
		{ code: 20261001, name: '令和8年10月1日', current: true },
	];

	it('入力順にかかわらず、その日に有効な最新のダイヤの版を選ぶ', () => {
		expect(generationForDate(generations, '2026-10-05')?.code).toBe(20261001);
		expect(generationForDate(generations, '2026-10-20')?.code).toBe(20261020);
		expect(generationForDate(generations, '2027-01-01')?.code).toBe(20261020);
	});

	it('有効になる日の当日から使う', () => {
		expect(generationForDate(generations, '2026-10-01')?.code).toBe(20261001);
		expect(generationForDate(generations, '2026-09-30')?.code).toBe(20260401);
	});

	it('どの版もまだ有効でなければ、いちばん古い版を選ぶ', () => {
		expect(generationForDate(generations, '2026-01-01')?.code).toBe(20260401);
	});

	it('版がなければ null', () => {
		expect(generationForDate([], '2026-10-05')).toBeNull();
	});
});
