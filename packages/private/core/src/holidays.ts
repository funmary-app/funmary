// 祝日の決め方。保存された祝日 (内閣府の CSV、または同梱の CSV) を正本にし、それより先の年だけを推定で補う。推定した祝日は、出どころを 'estimated' にして区別する。
// I/O は持たない。推定のもとになるデータは、estimate として渡す。
import type { CalendarDate } from './calendar-date.ts';

export type HolidaySource = 'cabinetOffice' | 'bundled' | 'estimated';

export interface ResolvedHoliday {
	readonly date: CalendarDate;
	readonly name: string;
	readonly source: HolidaySource;
}

export interface ResolveHolidaysInput {
	/** 保存されている祝日 (出どころ 'estimated' は保存しないので、含まれない) */
	readonly stored: readonly ResolvedHoliday[];
	/** ある年の祝日を推定する */
	readonly estimate: (year: number) => readonly { date: CalendarDate; name: string }[];
	/** 何も保存されていないときに、推定を始める年。省くと throughYear だけ */
	readonly fromYear?: number;
	/** ここまでの年を扱う */
	readonly throughYear: number;
}

export function resolveHolidays(input: ResolveHolidaysInput): ResolvedHoliday[] {
	const byDate = new Map<CalendarDate, ResolvedHoliday>();
	for (const holiday of input.stored) byDate.set(holiday.date, holiday);

	// 保存された最後の年までは、保存された内容が正しい (載っていない日は祝日ではない)。その先だけ推定する
	const lastStoredYear = input.stored.reduce(
		(max, holiday) => Math.max(max, Number(holiday.date.slice(0, 4))),
		Number.NEGATIVE_INFINITY,
	);
	const firstEstimatedYear =
		input.stored.length > 0 ? lastStoredYear + 1 : (input.fromYear ?? input.throughYear);
	for (let year = firstEstimatedYear; year <= input.throughYear; year++) {
		for (const { date, name } of input.estimate(year)) {
			if (!byDate.has(date)) byDate.set(date, { date, name, source: 'estimated' });
		}
	}
	return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
