import { describe, expect, it } from 'vitest';
import {
	dateLabel,
	formatBusLeg,
	formatChanges,
	formatToday,
	formatWeek,
	noteLabel,
	type DayNoteLike,
	type LessonLike,
} from './format.ts';
import { createStyle } from './style.ts';

const plain = createStyle({ env: {}, isTTY: false });
const lesson = (overrides: Partial<LessonLike> = {}): LessonLike => ({
	date: '2026-10-07',
	period: 2,
	start: '10:45',
	end: '12:15',
	subjectName: '線形代数',
	room: '363',
	status: 'normal',
	change: null,
	...overrides,
});

describe('dateLabel と noteLabel', () => {
	it('日付に曜日を付ける', () => {
		expect(dateLabel('2026-10-07')).toBe('10/07 (水)');
		expect(dateLabel('2026-10-11')).toBe('10/11 (日)');
	});

	it('授業の事情を、文にする', () => {
		expect(noteLabel({ kind: 'holiday', name: '文化の日' })).toBe('祝日: 文化の日');
		expect(noteLabel({ kind: 'substitute', weekday: 1 })).toBe('振替授業日: 月曜の授業');
		expect(noteLabel({ kind: 'noClass', label: '開学記念日' })).toBe('休講日: 開学記念日');
		expect(noteLabel({ kind: 'noClass', label: null })).toBe('休講日');
	});
});

describe('formatToday', () => {
	it('授業を表にして、予定を並べる', () => {
		const lines = formatToday(
			{
				date: '2026-10-07',
				lessons: [lesson(), lesson({ period: 3, subjectName: '英語', status: 'cancelled' })],
				events: [
					{ title: '歯医者', location: '駅前', allDay: false, start: '18:00', end: '19:00' },
					{ title: '誕生日', location: null, allDay: true, start: null, end: null },
				],
			},
			plain,
			80,
		);
		expect(lines).toEqual([
			'10/07 (水)',
			'時限  時刻         科目      教室  状態',
			'2 限  10:45-12:15  線形代数  363',
			'3 限  10:45-12:15  英語      363   休講',
			'',
			'予定',
			'  18:00-19:00  歯医者 (駅前)',
			'  終日  誕生日',
		]);
	});

	it('授業がなければ、そう書く。教室変更には、移る前の教室を添える', () => {
		expect(formatToday({ date: '2026-10-07', lessons: [], events: [] }, plain, 80)).toEqual([
			'10/07 (水)',
			'授業はありません',
		]);
		const changed = formatToday(
			{
				date: '2026-10-07',
				lessons: [lesson({ status: 'roomChanged', change: { fromRoom: '484' } })],
				events: [],
			},
			plain,
			80,
		);
		expect(changed[2]).toContain('教室変更 (484 から)');
	});
});

describe('formatWeek', () => {
	const day = (
		date: string,
		weekday: number,
		lessons: LessonLike[] = [],
		note: DayNoteLike | null = null,
	) => ({ date, weekday, note, cells: [{ lessons }] });

	it('月曜から金曜は、授業がなくても出す。土曜と日曜は、授業か事情のあるときだけ', () => {
		const lines = formatWeek(
			{
				days: [
					day('2026-10-05', 1, [lesson({ date: '2026-10-05' })]),
					day('2026-10-06', 2),
					day('2026-10-10', 6),
					day('2026-10-11', 7, [], { kind: 'holiday', name: '仮の祝日' }),
				],
			},
			plain,
			80,
		);
		const text = lines.join('\n');
		expect(text).toContain('10/05 (月)');
		expect(text).toContain('10/06 (火)');
		expect(text).toContain('  授業はありません');
		expect(text).not.toContain('10/10 (土)');
		expect(text).toContain('10/11 (日)  祝日: 仮の祝日');
	});
});

describe('formatChanges', () => {
	it('日付と時限の順に、種類つきで並べる。なければ、そう書く', () => {
		const lines = formatChanges(
			[
				lesson({ date: '2026-10-09', status: 'cancelled' }),
				lesson({ date: '2026-10-08', status: 'makeup', period: 1 }),
			],
			plain,
			80,
		);
		expect(lines[1]).toContain('10/08 (木)');
		expect(lines[1]).toContain('補講');
		expect(lines[2]).toContain('休講');
		expect(formatChanges([], plain, 80)).toEqual(['休講、補講、教室変更はありません']);
	});
});

describe('formatBusLeg', () => {
	const departure = (time: string, arrival: string | null) => ({
		time,
		arrivalTime: arrival,
		from: { name: '亀田支所前' },
		to: { name: 'はこだて未来大学' },
		routes: ['55A'],
		destination: '赤川',
	});
	const leg = {
		from: { name: '亀田支所前' },
		to: { name: 'はこだて未来大学' },
		day: 'weekday' as const,
		todayDay: 'weekday' as const,
		checkedAt: '2026-10-10T00:00:00Z',
		departures: [
			departure('07:50', '08:15'),
			departure('08:05', '08:30'),
			departure('09:05', null),
		],
	};

	it('今日の区分なら、いまから先の便を、あと何分かつきで、limit 件出す', () => {
		const lines = formatBusLeg(leg, { nowTime: '08:00', limit: 1, all: false }, plain, 100);
		expect(lines[0]).toBe('亀田支所前 → はこだて未来大学 (平日)');
		expect(lines).toHaveLength(3);
		expect(lines[2]).toContain('08:05');
		expect(lines[2]).toContain('08:30');
		expect(lines[2]).toContain('赤川行き');
		expect(lines[2]).toContain('あと 5 分');
	});

	it('all か、今日でない区分なら、その日の全部を出す。あとの分は付けない', () => {
		const all = formatBusLeg(leg, { nowTime: '08:00', limit: 1, all: true }, plain, 100);
		expect(all).toHaveLength(5);
		expect(all.join('\n')).not.toContain('あと');
		const holiday = formatBusLeg(
			{ ...leg, day: 'holiday' },
			{ nowTime: '08:00', limit: 1, all: false },
			plain,
			100,
		);
		expect(holiday).toHaveLength(5);
		expect(holiday[0]).toContain('(休日)');
	});

	it('便がないときは、理由に合わせた文を出す', () => {
		const late = formatBusLeg(leg, { nowTime: '23:00', limit: 3, all: false }, plain, 100);
		expect(late[1]).toBe('今日はこのあとの便がありません');
		const none = formatBusLeg(
			{ ...leg, departures: [], checkedAt: null },
			{ nowTime: '08:00', limit: 3, all: false },
			plain,
			100,
		);
		expect(none[1]).toBe('時刻表を、まだ取り込めていません');
	});
});
