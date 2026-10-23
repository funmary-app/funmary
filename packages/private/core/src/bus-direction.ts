// 「停留所 A から未来大へ」「未来大から A へ」の向きの判定。
// 時刻表の API は、停留所ごとの発車表で、便が次にどこへ行くかの並びを持たない。
// そこで、発車表の「経由」と「行き先」の文字から向きを決める。
// 55 系統はどれも未来大を通る (函館駅前、未来大、赤川の順に並ぶ) ので、次のように決められる。
// - A から未来大へ: A の発車のうち、経由か行き先に未来大があるもの
// - 未来大から A へ: 未来大の発車のうち、行き先が「A から未来大と反対へ向かう便」の行き先と同じもの
//   (その便は、未来大を通ってから A を通る)。または、経由か行き先に A があるもの
// I/O は持たない。
import type { BusPlatformTimetable, BusStop, BusStopTimetable } from './bus.ts';

/** 向き。toUniversity は A から未来大へ、fromUniversity は未来大から A へ */
export type BusDirection = 'toUniversity' | 'fromUniversity';
export const BUS_DIRECTIONS: readonly BusDirection[] = ['toUniversity', 'fromUniversity'];

export interface BusUniversityStop extends BusStop {
	/** 経由や行き先で、停留所名の代わりに使われる短い呼び名。例: 未来大 */
	readonly aliases?: readonly string[];
}

/** 未来大の停留所の既定 */
export const UNIVERSITY_STOP: BusUniversityStop = {
	id: '14023',
	name: 'はこだて未来大学',
	aliases: ['未来大'],
};

/**
 * 路線が二つに分かれる停留所。亀田支所前から先で、五稜郭の側と昭和の側に分かれ、未来大の側では合流する。
 * 選んだ停留所が通らない系統の便は、この停留所と未来大の間の便として足す
 */
export const BRANCH_JUNCTION_STOP: BusStop = { id: '14013', name: '亀田支所前' };

/** 全角と半角、空白の違いを無視して比べるための形 */
const normalize = (text: string) => text.normalize('NFKC').replace(/\s+/g, '');

/**
 * 停留所の名前が同じか (全角と半角、空白の違いは無視する)。向きごとに別のバス停コードを持つ停留所 (昭和営業所前など) は、
 * 同じ名前の別のコードとして一覧に並ぶ
 */
export const sameStopName = (a: string, b: string): boolean => normalize(a) === normalize(b);

/** 同じ名前の停留所を、はじめの 1 つだけ残す (選ぶ一覧に、同じ名前を 2 度出さない) */
export function uniqueStopsByName<T extends BusStop>(stops: readonly T[]): T[] {
	const seen = new Set<string>();
	return stops.filter((stop) => {
		const key = normalize(stop.name);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** 経由や行き先の文に、停留所の名前 (または呼び名) が入っているか */
export function mentionsStop(
	text: string | undefined,
	name: string,
	aliases: readonly string[] = [],
): boolean {
	if (text === undefined) return false;
	const haystack = normalize(text);
	return [name, ...aliases].some((candidate) => haystack.includes(normalize(candidate)));
}

type Departure = BusPlatformTimetable['departures'][number];

const withDepartures = (
	timetables: readonly BusPlatformTimetable[],
	keep: (departure: Departure) => boolean,
): BusPlatformTimetable[] =>
	timetables.map((timetable) => ({
		...timetable,
		departures: timetable.departures.filter(keep),
	}));

export interface DirectionalTimetables {
	/** 発車する停留所。toUniversity なら A、fromUniversity なら未来大 */
	readonly stop: BusStop;
	/** その向きの発車だけに絞った、のりばと日の区分ごとの発車表 */
	readonly timetables: readonly BusPlatformTimetable[];
}

/**
 * 未来大の発車表から、行き先を「北」(赤川の側) と「南」に分ける。
 * 未来大の発車は、系統ごとに、南へ向かう便と、北へ向かう便の 2 つの行き先があり、すべての系統が共有する行き先が北になる
 * (55 系統は、函館駅前、未来大、赤川の順に並ぶ)。共有する行き先が見つからなければ、北は空
 */
function northDestinations(university: BusStopTimetable): ReadonlySet<string> {
	const routesOf = new Map<string, Set<string>>();
	for (const departure of university.timetables.flatMap((timetable) => timetable.departures)) {
		if (departure.destination === undefined) continue;
		const key = normalize(departure.destination);
		const routes = routesOf.get(key) ?? new Set<string>();
		for (const route of departure.routes) routes.add(route);
		routesOf.set(key, routes);
	}
	const most = Math.max(0, ...[...routesOf.values()].map((routes) => routes.size));
	if (most < 2) return new Set();
	return new Set([...routesOf].filter(([, routes]) => routes.size === most).map(([key]) => key));
}

/**
 * A (stop) の発車の行き先を、未来大へ向かうものと、反対へ向かうものに分ける。
 * 同じ行き先の便は、同じ向きに進む。A が未来大より南なら、北の行き先が未来大へ向かい、北なら、南の行き先が未来大へ向かう。
 * A の側は、経由に未来大と書かれた便の行き先から決める (北の行き先なら南、南の行き先なら北)。決められなければ南とする。
 * 未来大の発車表に、行き先の南北が決められないときは、経由に未来大と書かれた便が半分以上ある行き先を、未来大へ向かうとする
 */
function destinationsTowardUniversity(
	stop: BusStopTimetable,
	university: BusStopTimetable,
	universityStop: BusUniversityStop,
): { readonly toward: ReadonlySet<string>; readonly away: ReadonlySet<string> } {
	const north = northDestinations(university);
	const known = new Set<string>();
	for (const departure of university.timetables.flatMap((timetable) => timetable.departures)) {
		if (departure.destination !== undefined) known.add(normalize(departure.destination));
	}
	const counts = new Map<string, { total: number; mentions: number }>();
	for (const departure of stop.timetables.flatMap((timetable) => timetable.departures)) {
		if (departure.destination === undefined) continue;
		const key = normalize(departure.destination);
		const entry = counts.get(key) ?? { total: 0, mentions: 0 };
		entry.total += 1;
		if (
			mentionsStop(departure.via, universityStop.name, universityStop.aliases) ||
			mentionsStop(departure.destination, universityStop.name, universityStop.aliases)
		) {
			entry.mentions += 1;
		}
		counts.set(key, entry);
	}

	const toward = new Set<string>();
	const away = new Set<string>();
	if (north.size > 0) {
		// A が北にあるか: 経由に未来大と書かれた便が、南の行き先に多ければ北
		let mentionsNorth = 0;
		let mentionsSouth = 0;
		for (const [destination, entry] of counts) {
			// 南北が決められる行き先だけを、根拠にする (行き先に未来大とある便などは、数えない)
			if (north.has(destination)) mentionsNorth += entry.mentions;
			else if (known.has(destination)) mentionsSouth += entry.mentions;
		}
		const stopIsNorth = mentionsSouth > mentionsNorth;
		for (const [destination, entry] of counts) {
			const classified = north.has(destination) || known.has(destination);
			const towardUniversity = classified
				? north.has(destination) !== stopIsNorth
				: entry.mentions * 2 >= entry.total;
			(towardUniversity ? toward : away).add(destination);
		}
		return { toward, away };
	}

	const anyMention = [...counts.values()].some((entry) => entry.mentions > 0);
	for (const [destination, entry] of counts) {
		(!anyMention || entry.mentions * 2 >= entry.total ? toward : away).add(destination);
	}
	return { toward, away };
}

/**
 * A (stop) と未来大の発車表から、向きに合う発車だけを残す。どちらかの発車表がなければ null。
 * 経由と行き先は、事業者が時刻表に書いた文字なので、ここでは文字の一致だけを見る
 */
export function filterByDirection(
	direction: BusDirection,
	stop: BusStopTimetable | null,
	university: BusStopTimetable | null,
	universityStop: BusUniversityStop = UNIVERSITY_STOP,
): DirectionalTimetables | null {
	if (!stop || !university) return null;
	const { toward, away } = destinationsTowardUniversity(stop, university, universityStop);
	const destinationOf = (departure: Departure) =>
		departure.destination === undefined ? null : normalize(departure.destination);

	if (direction === 'toUniversity') {
		return {
			stop: stop.stop,
			timetables: withDepartures(stop.timetables, (departure) => {
				const destination = destinationOf(departure);
				return (
					(destination !== null && toward.has(destination)) ||
					mentionsStop(departure.via, universityStop.name, universityStop.aliases)
				);
			}),
		};
	}

	// 未来大の発車のうち、A から未来大と反対へ向かう行き先の便は、未来大を通ってから A を通る
	const passesStop = (departure: Departure) => {
		const destination = destinationOf(departure);
		return (
			(destination !== null && away.has(destination)) ||
			mentionsStop(departure.via, stop.stop.name) ||
			mentionsStop(departure.destination, stop.stop.name)
		);
	};
	return { stop: university.stop, timetables: withDepartures(university.timetables, passesStop) };
}

/** 出発から到着までの、いちばん長い時間 (分)。これより離れた便は、同じ便とみなさない */
const MAX_TRAVEL_MINUTES = 45;

const minutesOf = (time: string) => {
	const [hours, minutes] = time.split(':').map(Number);
	return (hours ?? 0) * 60 + (minutes ?? 0);
};

/**
 * 出発する停留所の発車 (from) に、到着する停留所の発車 (to) から、同じ便の到着の時刻を結ぶ。
 * 時刻表には便をたどる情報がないので、同じ行き先で、系統が重なり、あとに発車する便を、時刻の順に 1 対 1 で結ぶ。
 * 結べなければ null。from は時刻の順に並んでいるものとする
 */
export function matchArrivals(
	from: readonly Departure[],
	to: readonly Departure[],
): (string | null)[] {
	const used = new Set<number>();
	return from.map((departure) => {
		const destination =
			departure.destination === undefined ? null : normalize(departure.destination);
		if (destination === null) return null;
		const start = minutesOf(departure.time);
		let best: { index: number; minutes: number } | null = null;
		to.forEach((candidate, index) => {
			if (used.has(index) || candidate.destination === undefined) return;
			if (normalize(candidate.destination) !== destination) return;
			if (!candidate.routes.some((route) => departure.routes.includes(route))) return;
			const elapsed = minutesOf(candidate.time) - start;
			if (elapsed <= 0 || elapsed > MAX_TRAVEL_MINUTES) return;
			if (best === null || elapsed < best.minutes) best = { index, minutes: elapsed };
		});
		if (best === null) return null;
		used.add((best as { index: number }).index);
		return to[(best as { index: number }).index]?.time ?? null;
	});
}
