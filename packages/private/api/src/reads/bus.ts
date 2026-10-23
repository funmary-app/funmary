// バスの時刻表の読み取り。保存した写し (BusStore) だけを読み、外部には接続しない。
// 画面、公開 API、MCP、Discord が同じ関数を呼ぶ。バスの機能を使わない設定 (bus が null) では、どれも null を返す。
import {
	addDays,
	busDayType,
	BRANCH_JUNCTION_STOP,
	DEFAULT_BUS_STOP_IDS,
	filterByDirection,
	matchArrivals,
	generationForDate,
	jstDateTime,
	resolveHolidays,
	sameStopName,
	UNIVERSITY_STOP,
	upcomingDepartures,
	type BusDayType,
	type BusDirection,
	type BusGeneration,
	type BusPlatformTimetable,
	type BusStopTimetable,
	type CalendarDate,
	type UpcomingBusDeparture,
} from '@funmary/core';
import type { BusStore, HolidayStore } from '@funmary/db';

export interface BusSources {
	/** バスの時刻表の写し。BUS_API_BASE_URL がないときは null */
	readonly bus: Pick<BusStore, 'getCatalog' | 'getTimetable'> | null;
	readonly holidays: Pick<HolidayStore, 'list'>;
	/** 内閣府の CSV にまだ載っていない年の祝日の推定 */
	readonly estimateHolidays: (year: number) => readonly { date: CalendarDate; name: string }[];
}

/** 次の発車を数える範囲 (昨日の深夜便、今日、明日) のうち、遠い日付までの祝日を用意する */
function holidayDates(sources: BusSources, date: CalendarDate): Set<CalendarDate> {
	const resolved = resolveHolidays({
		stored: sources.holidays.list(),
		estimate: sources.estimateHolidays,
		throughYear: Number(addDays(date, 1).slice(0, 4)),
	});
	return new Set(resolved.map((holiday) => holiday.date));
}

/** その日の発車表の区分 (平日、または土曜、日曜、祝日)。画面が、今日どちらを見せるかに使う */
export function busDayTypeOn(sources: BusSources, date: CalendarDate): BusDayType {
	return busDayType(date, holidayDates(sources, date));
}

export interface PublicBusStops {
	/** 保存した一覧を、API に最後に確かめた日時 (ISO 8601)。まだ取り込んでいなければ null */
	readonly checkedAt: string | null;
	readonly generations: readonly BusGeneration[];
	readonly stops: readonly { id: string; name: string; highlighted: boolean }[];
}

/** 停留所の一覧。強調する停留所 (未来大、亀田支所前) には highlighted が付く */
export function listBusStops(sources: BusSources): PublicBusStops | null {
	if (!sources.bus) return null;
	const stored = sources.bus.getCatalog();
	if (!stored) return { checkedAt: null, generations: [], stops: [] };
	return {
		checkedAt: stored.checkedAt.toISOString(),
		generations: stored.catalog.generations,
		stops: stored.catalog.stops.map((stop) => ({
			id: stop.id,
			name: stop.name,
			highlighted: DEFAULT_BUS_STOP_IDS.includes(stop.id),
		})),
	};
}

export interface PublicBusPlatform {
	readonly platformNo: number;
	readonly platformName: string | null;
	/** weekday は平日、holiday は土曜、日曜、祝日 */
	readonly day: 'weekday' | 'holiday';
	/** 事業者が添えた注意書き。印の意味もここにある */
	readonly notes: readonly string[];
	readonly departures: readonly {
		readonly time: string;
		readonly routes: readonly string[];
		readonly via: string | null;
		readonly destination: string | null;
		readonly marks: readonly string[];
	}[];
}

const toPublicPlatform = (platform: BusPlatformTimetable): PublicBusPlatform => ({
	platformNo: platform.platformNo,
	platformName: platform.platformName ?? null,
	day: platform.day,
	notes: platform.notes,
	departures: platform.departures.map((departure) => ({
		time: departure.time,
		routes: departure.routes,
		via: departure.via ?? null,
		destination: departure.destination ?? null,
		marks: departure.marks,
	})),
});

export interface PublicBusStopTimetable {
	readonly stop: { readonly id: string; readonly name: string };
	readonly generation: BusGeneration;
	/** API が事業者から、この発車表を取った日時 (ISO 8601) */
	readonly fetchedAt: string | null;
	/** Funmary が API に最後に確かめた日時 (ISO 8601) */
	readonly checkedAt: string;
	readonly platforms: readonly PublicBusPlatform[];
}

function toPublicTimetable(timetable: BusStopTimetable, checkedAt: Date): PublicBusStopTimetable {
	return {
		stop: timetable.stop,
		generation: timetable.generation,
		fetchedAt: timetable.fetchedAt ?? null,
		checkedAt: checkedAt.toISOString(),
		platforms: timetable.timetables.map(toPublicPlatform),
	};
}

/** 1 つの停留所の発車表。generation を省くと、今日に有効な版。保存していなければ null */
export function getBusStopTimetable(
	sources: BusSources,
	now: Date,
	stopId: string,
	generation?: number,
): PublicBusStopTimetable | null {
	if (!sources.bus) return null;
	const catalog = sources.bus.getCatalog()?.catalog;
	if (!catalog) return null;
	const code = generation ?? generationForDate(catalog.generations, jstDateTime(now).date)?.code;
	if (code === undefined) return null;
	const stored = sources.bus.getTimetable(stopId, code);
	return stored && toPublicTimetable(stored.timetable, stored.checkedAt);
}

export interface PublicUpcomingBus {
	/** この発車が属するダイヤの日 (YYYY-MM-DD)。24 時以降の発車は、日付が変わったあとも前日の日付 */
	readonly serviceDate: CalendarDate;
	/** HH:MM (日本時間)。24 時以降は 24:10 のように書く */
	readonly time: string;
	readonly minutesUntil: number;
	readonly platformNo: number;
	readonly platformName: string | null;
	readonly routes: readonly string[];
	readonly via: string | null;
	readonly destination: string | null;
	readonly marks: readonly string[];
}

export interface PublicNextBusesAtStop {
	readonly stop: { readonly id: string; readonly name: string };
	readonly generation: BusGeneration | null;
	readonly checkedAt: string | null;
	/** 発車表がまだないときは空 */
	readonly upcoming: readonly PublicUpcomingBus[];
	/** 発車に付く印の意味を含む、のりばごとの注意書き */
	readonly platforms: readonly {
		platformNo: number;
		platformName: string | null;
		notes: readonly string[];
	}[];
}

export interface PublicNextBuses {
	readonly stops: readonly PublicNextBusesAtStop[];
}

export const DEFAULT_NEXT_BUS_LIMIT = 3;
export const MAX_NEXT_BUS_LIMIT = 20;

/**
 * 今から先の発車。昨日、今日、明日のダイヤを、日ごとに有効な版で見る (ダイヤ改正の前後をまたいでも正しく数える)。
 * stopId を省くと、強調する停留所を返す。一覧にない停留所を指定したら null
 */
export function getNextBuses(
	sources: BusSources,
	now: Date,
	options: { stopId?: string | undefined; limit?: number | undefined },
): PublicNextBuses | null {
	if (!sources.bus) return null;
	const stored = sources.bus.getCatalog();
	const limit = Math.min(Math.max(options.limit ?? DEFAULT_NEXT_BUS_LIMIT, 1), MAX_NEXT_BUS_LIMIT);
	const stopsInCatalog = stored?.catalog.stops ?? [];
	const wanted = options.stopId
		? stopsInCatalog.filter((stop) => stop.id === options.stopId)
		: DEFAULT_BUS_STOP_IDS.flatMap((id) => stopsInCatalog.filter((stop) => stop.id === id));
	if (options.stopId && wanted.length === 0) return null;

	const current = jstDateTime(now);
	const holidays = holidayDates(sources, current.date);
	const generations = stored?.catalog.generations ?? [];
	// 昨日 (深夜便)、今日、明日のそれぞれに有効な版
	const serviceDates = [-1, 0, 1].map((offset) => addDays(current.date, offset));
	const generationOf = (date: CalendarDate) => generationForDate(generations, date);

	const stops = wanted.map((stop): PublicNextBusesAtStop => {
		const todayGeneration = generationOf(current.date);
		const todayStored = todayGeneration
			? sources.bus?.getTimetable(stop.id, todayGeneration.code)
			: null;
		const found: UpcomingBusDeparture[] = [];
		for (const code of new Set(
			serviceDates.map((date) => generationOf(date)?.code).filter((c) => c !== undefined),
		)) {
			const timetable = sources.bus?.getTimetable(stop.id, code)?.timetable;
			if (!timetable) continue;
			for (const item of upcomingDepartures(timetable.timetables, {
				now: current,
				holidays,
				limit: MAX_NEXT_BUS_LIMIT * 3,
			})) {
				if (generationOf(item.serviceDate)?.code === code) found.push(item);
			}
		}
		found.sort((a, b) => a.minutesUntil - b.minutesUntil || a.platformNo - b.platformNo);
		return {
			stop,
			generation: todayGeneration,
			checkedAt: todayStored?.checkedAt.toISOString() ?? null,
			upcoming: found.slice(0, limit).map((item) => ({
				serviceDate: item.serviceDate,
				time: item.departure.time,
				minutesUntil: item.minutesUntil,
				platformNo: item.platformNo,
				platformName: item.platformName ?? null,
				routes: item.departure.routes,
				via: item.departure.via ?? null,
				destination: item.departure.destination ?? null,
				marks: item.departure.marks,
			})),
			platforms: [
				...new Map(
					(todayStored?.timetable.timetables ?? []).map((platform) => [
						`${platform.platformNo}:${platform.day}`,
						platform,
					]),
				).values(),
			]
				.filter((platform) => platform.day === busDayType(current.date, holidays))
				.map((platform) => ({
					platformNo: platform.platformNo,
					platformName: platform.platformName ?? null,
					notes: platform.notes,
				})),
		};
	});
	return { stops };
}

export interface PublicBusLeg {
	/** 利用者が選んだ停留所 A */
	readonly stop: { readonly id: string; readonly name: string };
	readonly direction: BusDirection;
	/** 乗る停留所と、降りる停留所。direction が toUniversity なら A から未来大、fromUniversity なら未来大から A */
	readonly from: { readonly id: string; readonly name: string };
	readonly to: { readonly id: string; readonly name: string };
	/** 発車を並べた日の区分 (weekday は平日、holiday は土曜、日曜、祝日) */
	readonly day: BusDayType;
	/** 今日の区分 */
	readonly todayDay: BusDayType;
	readonly generation: BusGeneration | null;
	/** Funmary が時刻表の API に最後に確かめた日時 (ISO 8601)。発車表がなければ null */
	readonly checkedAt: string | null;
	/** その区分の、この向きの発車のすべて。時刻の順 */
	readonly departures: readonly PublicLegDeparture[];
	/** これからの発車 (day が今日の区分のときだけ。違えば空) */
	readonly upcoming: readonly PublicLegUpcoming[];
	/** 事業者の注意書き。発車に付く印の意味もここにある */
	readonly notes: readonly string[];
}

export interface PublicLegDeparture {
	/** HH:MM (日本時間)。24 時以降は 24:10 のように書く */
	readonly time: string;
	/**
	 * 到着する停留所に着く時刻 (HH:MM)。時刻表に便をたどる情報はないので、到着する停留所の発車表から、
	 * 同じ行き先で系統が重なる、あとの便を結んで求める。結べなければ null
	 */
	readonly arrivalTime: string | null;
	/** この便に乗る停留所と、降りる停留所。亀田支所前から先で路線が分かれるので、選んだ停留所を通らない系統の便は、亀田支所前と未来大の間になる */
	readonly from: { readonly id: string; readonly name: string };
	readonly to: { readonly id: string; readonly name: string };
	readonly platformNo: number;
	readonly platformName: string | null;
	readonly routes: readonly string[];
	readonly via: string | null;
	readonly destination: string | null;
	readonly marks: readonly string[];
}

export interface PublicLegUpcoming extends Omit<PublicLegDeparture, 'arrivalTime'> {
	/** この発車が属するダイヤの日。24 時以降の発車は、日付が変わったあとも前日の日付 */
	readonly serviceDate: CalendarDate;
	readonly minutesUntil: number;
}

export const DEFAULT_LEG_UPCOMING_LIMIT = 5;

type Stop = { readonly id: string; readonly name: string };

/** 1 つの区間 (乗る停留所から降りる停留所まで) の、向きに合う発車表と、到着を結ぶための相手の発車表 */
interface LegSource {
	readonly from: Stop;
	readonly to: Stop;
	readonly timetables: readonly BusPlatformTimetable[];
	/** 降りる停留所の発車表 (到着の時刻を結ぶのに使う) */
	readonly counterpart: readonly BusPlatformTimetable[];
}

/**
 * 「A から未来大へ」「未来大から A へ」の発車。A は未来大を通る任意の停留所。
 * 向きは、時刻表の経由と行き先の文字から決める (@funmary/core の filterByDirection)。
 * 亀田支所前から先で路線が二つに分かれる (五稜郭の側と昭和の側) ので、A が通らない系統の便は、
 * 亀田支所前と未来大の間の便として足す (共通の区間なので、A の位置によらず乗れる)。
 * 未来大そのもの、一覧にない停留所は null。A の発車表がまだなければ、発車は空
 */
export function getBusLeg(
	sources: BusSources,
	now: Date,
	options: {
		readonly stopId: string;
		readonly direction: BusDirection;
		readonly day?: BusDayType | undefined;
		readonly limit?: number | undefined;
	},
): PublicBusLeg | null {
	if (!sources.bus || options.stopId === UNIVERSITY_STOP.id) return null;
	const stored = sources.bus.getCatalog();
	const stop = stored?.catalog.stops.find((candidate) => candidate.id === options.stopId);
	if (!stored || !stop) return null;
	const university = stored.catalog.stops.find(
		(candidate) => candidate.id === UNIVERSITY_STOP.id,
	) ?? {
		id: UNIVERSITY_STOP.id,
		name: UNIVERSITY_STOP.name,
	};
	const junction = stored.catalog.stops.find(
		(candidate) => candidate.id === BRANCH_JUNCTION_STOP.id,
	);

	const current = jstDateTime(now);
	const holidays = holidayDates(sources, current.date);
	const todayDay = busDayType(current.date, holidays);
	const day = options.day ?? todayDay;
	const generation = generationForDate(stored.catalog.generations, current.date);
	const timetableOf = (stopId: string) =>
		generation ? (sources.bus?.getTimetable(stopId, generation.code) ?? null) : null;
	// 同じ名前で、向きごとに別のバス停コードを持つ停留所がある (昭和営業所前など)。1 つのコードの発車表には、
	// 片方の向きの便しかないので、同じ名前のコードの発車表をまとめて、1 つの停留所として向きを決める
	const sameStop = stored.catalog.stops.filter(
		(candidate) => candidate.id !== university.id && sameStopName(candidate.name, stop.name),
	);
	const sameStopTimetables = sameStop
		.map((candidate) => timetableOf(candidate.id))
		.filter((stored) => stored !== null);
	const ownTimetable = timetableOf(stop.id) ?? sameStopTimetables[0];
	const stopTimetable = ownTimetable && {
		...ownTimetable,
		timetable: {
			...ownTimetable.timetable,
			timetables: sameStopTimetables.flatMap((stored) => stored.timetable.timetables),
		},
	};
	const universityTimetable = timetableOf(university.id);
	const toUniversity = options.direction === 'toUniversity';

	const filtered = filterByDirection(
		options.direction,
		stopTimetable?.timetable ?? null,
		universityTimetable?.timetable ?? null,
		UNIVERSITY_STOP,
	);
	const own: LegSource = {
		from: toUniversity ? stop : university,
		to: toUniversity ? university : stop,
		timetables: filtered?.timetables ?? [],
		counterpart: (toUniversity ? universityTimetable : stopTimetable)?.timetable.timetables ?? [],
	};
	const sourcesOfLeg: LegSource[] = [own];

	// A が通らない系統の便を、亀田支所前と未来大の間の便として足す
	const junctionTimetable =
		junction && !sameStop.some((candidate) => candidate.id === junction.id)
			? timetableOf(junction.id)
			: null;
	// A の発車表がないときは、足さない (A が何も通らないのか、まだ取り込めていないのか、区別できないため)
	if (stopTimetable && junction && junctionTimetable && universityTimetable) {
		const viaJunction = filterByDirection(
			options.direction,
			junctionTimetable.timetable,
			universityTimetable.timetable,
			UNIVERSITY_STOP,
		);
		const served = new Set(
			own.timetables.flatMap((timetable) =>
				timetable.departures.flatMap((departure) => departure.routes),
			),
		);
		const extra = (viaJunction?.timetables ?? []).map((timetable) => ({
			...timetable,
			departures: timetable.departures.filter(
				(departure) => !departure.routes.some((route) => served.has(route)),
			),
		}));
		if (extra.some((timetable) => timetable.departures.length > 0)) {
			sourcesOfLeg.push({
				from: toUniversity ? junction : university,
				to: toUniversity ? university : junction,
				timetables: extra,
				counterpart: (toUniversity ? universityTimetable : junctionTimetable).timetable.timetables,
			});
		}
	}

	const decorate = (
		source: LegSource,
		timetable: BusPlatformTimetable,
		departure: BusPlatformTimetable['departures'][number],
	) => ({
		from: source.from,
		to: source.to,
		platformNo: timetable.platformNo,
		platformName: timetable.platformName ?? null,
		routes: departure.routes,
		via: departure.via ?? null,
		destination: departure.destination ?? null,
		marks: departure.marks,
	});

	const ofDayLists = sourcesOfLeg.map((source) => {
		const sorted = source.timetables
			.filter((timetable) => timetable.day === day)
			.flatMap((timetable) => timetable.departures.map((departure) => ({ timetable, departure })))
			.toSorted(
				(a, b) =>
					a.departure.time.localeCompare(b.departure.time) ||
					a.timetable.platformNo - b.timetable.platformNo,
			);
		const counterpart = source.counterpart
			.filter((timetable) => timetable.day === day)
			.flatMap((timetable) => timetable.departures)
			.toSorted((a, b) => a.time.localeCompare(b.time));
		const arrivals = matchArrivals(
			sorted.map((item) => item.departure),
			counterpart,
		);
		return sorted.map(({ timetable, departure }, index): PublicLegDeparture => ({
			time: departure.time,
			arrivalTime: arrivals[index] ?? null,
			...decorate(source, timetable, departure),
		}));
	});
	const departures = ofDayLists
		.flat()
		.toSorted((a, b) => a.time.localeCompare(b.time) || a.platformNo - b.platformNo);

	const limit = Math.min(
		Math.max(options.limit ?? DEFAULT_LEG_UPCOMING_LIMIT, 1),
		MAX_NEXT_BUS_LIMIT,
	);
	const upcoming: PublicLegUpcoming[] =
		day === todayDay
			? sourcesOfLeg
					.flatMap((source) =>
						upcomingDepartures(source.timetables, { now: current, holidays, limit }).map(
							(item): PublicLegUpcoming => ({
								time: item.departure.time,
								serviceDate: item.serviceDate,
								minutesUntil: item.minutesUntil,
								from: source.from,
								to: source.to,
								platformNo: item.platformNo,
								platformName: item.platformName ?? null,
								routes: item.departure.routes,
								via: item.departure.via ?? null,
								destination: item.departure.destination ?? null,
								marks: item.departure.marks,
							}),
						),
					)
					.toSorted((a, b) => a.minutesUntil - b.minutesUntil || a.platformNo - b.platformNo)
					.slice(0, limit)
			: [];

	return {
		stop,
		direction: options.direction,
		from: own.from,
		to: own.to,
		day,
		todayDay,
		generation,
		checkedAt: stopTimetable?.checkedAt.toISOString() ?? null,
		departures,
		upcoming,
		notes: [
			...new Set(
				sourcesOfLeg.flatMap((source) =>
					source.timetables
						.filter((timetable) => timetable.day === day)
						.flatMap((timetable) => timetable.notes),
				),
			),
		],
	};
}
