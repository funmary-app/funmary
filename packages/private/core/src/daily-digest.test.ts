import { describe, expect, it } from 'vitest';
import {
	DEFAULT_DAILY_DIGEST_SETTINGS,
	digestSchedule,
	dueDailyDigest,
	isDigestTime,
	type DailyDigestSettings,
} from './daily-digest.ts';

const settings = (overrides: Partial<DailyDigestSettings> = {}): DailyDigestSettings => ({
	...DEFAULT_DAILY_DIGEST_SETTINGS,
	...overrides,
});

describe('digestSchedule', () => {
	it('前日は 20:30 に明日の分、当日は 06:30 に今日の分を送る', () => {
		expect(digestSchedule(settings({ timing: 'evening' }))).toEqual({
			time: '20:30',
			day: 'tomorrow',
		});
		expect(digestSchedule(settings({ timing: 'morning' }))).toEqual({
			time: '06:30',
			day: 'today',
		});
	});

	it('カスタムは、利用者が選んだ時刻と日を使う', () => {
		expect(
			digestSchedule(settings({ timing: 'custom', customTime: '12:05', customDay: 'today' })),
		).toEqual({ time: '12:05', day: 'today' });
	});
});

describe('dueDailyDigest', () => {
	it('送る時刻になったら、対象の日を返す', () => {
		expect(dueDailyDigest(settings(), { date: '2026-10-01', time: '20:30' }, null)).toEqual({
			date: '2026-10-02',
		});
		expect(
			dueDailyDigest(settings({ timing: 'morning' }), { date: '2026-10-01', time: '06:30' }, null),
		).toEqual({ date: '2026-10-01' });
	});

	it('送る時刻の前と、取り戻す時間を過ぎたあとは送らない', () => {
		expect(dueDailyDigest(settings(), { date: '2026-10-01', time: '20:25' }, null)).toBeNull();
		expect(dueDailyDigest(settings(), { date: '2026-10-01', time: '22:30' }, null)).toBeNull();
	});

	it('止まっていた間の分は、取り戻す時間のうちなら遅れて送る', () => {
		expect(dueDailyDigest(settings(), { date: '2026-10-01', time: '22:25' }, null)).toEqual({
			date: '2026-10-02',
		});
	});

	it('同じ日の分は、2 回送らない', () => {
		expect(
			dueDailyDigest(settings(), { date: '2026-10-01', time: '20:35' }, '2026-10-02'),
		).toBeNull();
	});

	it('前日に明日の分を送っていれば、当日の朝に切り替えても、同じ日の分は送らない', () => {
		expect(
			dueDailyDigest(
				settings({ timing: 'morning' }),
				{ date: '2026-10-02', time: '06:30' },
				'2026-10-02',
			),
		).toBeNull();
	});

	it('取り戻す時間は、日付をまたがない', () => {
		const late = settings({ timing: 'custom', customTime: '23:30', customDay: 'tomorrow' });
		expect(dueDailyDigest(late, { date: '2026-10-01', time: '23:55' }, null)).toEqual({
			date: '2026-10-02',
		});
		expect(dueDailyDigest(late, { date: '2026-10-02', time: '00:10' }, null)).toBeNull();
	});

	it('無効にしていれば送らない', () => {
		expect(
			dueDailyDigest(settings({ enabled: false }), { date: '2026-10-01', time: '20:30' }, null),
		).toBeNull();
	});
});

describe('isDigestTime', () => {
	it('5 分刻みの HH:MM だけを受け付ける', () => {
		expect(isDigestTime('00:00')).toBe(true);
		expect(isDigestTime('23:55')).toBe(true);
		expect(isDigestTime('07:03')).toBe(false);
		expect(isDigestTime('24:00')).toBe(false);
		expect(isDigestTime('7:00')).toBe(false);
		expect(isDigestTime('午前07:00')).toBe(false);
		expect(isDigestTime('07:00頃')).toBe(false);
	});
});
