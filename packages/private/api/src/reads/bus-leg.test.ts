import type { BusCatalog, BusStopTimetable } from '@funmary/core';
import { createBusStore, createHolidayStore, type Database } from '@funmary/db';
import { useTestDatabase } from '@funmary/db/testing';
import { describe, expect, it } from 'vitest';
import { getBusLeg, type BusSources } from './bus.ts';

let database: Database;
useTestDatabase('funmary-bus-leg-', (db) => (database = db));

const generation = { code: 20261001, name: '令和8年10月1日', current: true };
const catalog: BusCatalog = {
	generatedAt: '2026-10-09T20:00:00.000Z',
	generations: [generation],
	stops: [
		{ id: '14013', name: '亀田支所前' },
		{ id: '14023', name: 'はこだて未来大学' },
		{ id: '11003', name: '函館駅前' },
	],
};
const CHECKED = new Date('2026-10-10T01:00:00Z');

function timetable(
	stop: { id: string; name: string },
	weekday: { time: string; destination: string; via?: string }[],
	holiday: { time: string; destination: string; via?: string }[] = [],
): BusStopTimetable {
	const platform = (day: 'weekday' | 'holiday', rows: typeof weekday) => ({
		platformNo: 1,
		platformName: '1 番のりば',
		day,
		notes: ['△＝学校休日運休'],
		departures: rows.map((row) => ({
			time: row.time,
			routes: ['55A'],
			destination: row.destination,
			...(row.via === undefined ? {} : { via: row.via }),
			marks: [],
		})),
	});
	return {
		generatedAt: CHECKED.toISOString(),
		generation,
		stop,
		timetables: [platform('weekday', weekday), platform('holiday', holiday)],
	};
}

function seeded(): BusSources {
	const bus = createBusStore(database);
	bus.saveCatalog(catalog, null, CHECKED);
	// 亀田支所前: 赤川行は未来大を通る。函館駅前行は、未来大とは反対へ向かう
	bus.saveTimetable(
		timetable(
			catalog.stops[0]!,
			[
				{ time: '08:05', destination: '赤川', via: '赤川通・はこだて未来大学' },
				{ time: '08:20', destination: '函館駅前', via: '五稜郭' },
				{ time: '09:05', destination: '赤川', via: '赤川通・はこだて未来大学' },
			],
			[{ time: '10:05', destination: '赤川', via: '赤川通・はこだて未来大学' }],
		),
		null,
		CHECKED,
	);
	bus.saveTimetable(
		timetable(
			catalog.stops[1]!,
			[
				{ time: '08:15', destination: '函館駅前', via: '亀田支所前・五稜郭' },
				{ time: '08:30', destination: '赤川' },
				{ time: '09:15', destination: '函館駅前', via: '亀田支所前・五稜郭' },
			],
			[{ time: '10:15', destination: '函館駅前', via: '亀田支所前・五稜郭' }],
		),
		null,
		CHECKED,
	);
	return { bus, holidays: createHolidayStore(database), estimateHolidays: () => [] };
}

// 2026-10-05 は月曜。日本時間 08:00 は UTC の前日 23:00
const MONDAY_8AM = new Date('2026-10-04T23:00:00Z');

describe('getBusLeg', () => {
	it('A から未来大へ: A の発車のうち、未来大へ向かう便を、その日の全部と、これからの分で返す', () => {
		const leg = getBusLeg(seeded(), MONDAY_8AM, {
			stopId: '14013',
			direction: 'toUniversity',
			limit: 2,
		});
		expect(leg).toMatchObject({
			stop: { id: '14013', name: '亀田支所前' },
			direction: 'toUniversity',
			from: { id: '14013', name: '亀田支所前' },
			to: { id: '14023', name: 'はこだて未来大学' },
			day: 'weekday',
			todayDay: 'weekday',
		});
		expect(leg?.departures.map((d) => d.time)).toEqual(['08:05', '09:05']);
		// 到着は、未来大の発車表から、同じ行き先 (赤川) のあとの便を結ぶ
		expect(leg?.departures.map((d) => d.arrivalTime)).toEqual(['08:30', null]);
		expect(leg?.upcoming.map((u) => [u.time, u.minutesUntil])).toEqual([
			['08:05', 5],
			['09:05', 65],
		]);
		expect(leg?.notes).toEqual(['△＝学校休日運休']);
	});

	it('未来大から A へ: 未来大の発車のうち、A を通る便だけを返す', () => {
		const leg = getBusLeg(seeded(), MONDAY_8AM, {
			stopId: '14013',
			direction: 'fromUniversity',
		});
		expect(leg).toMatchObject({
			from: { id: '14023', name: 'はこだて未来大学' },
			to: { id: '14013', name: '亀田支所前' },
		});
		expect(leg?.departures.map((d) => d.time)).toEqual(['08:15', '09:15']);
		// 到着は、A の発車表から結ぶ (A の 08:20 の函館駅前行き)
		expect(leg?.departures.map((d) => d.arrivalTime)).toEqual(['08:20', null]);
	});

	it('日の区分を指定すると、その区分の発車表を返す。これからの発車は、今日の区分のときだけ', () => {
		const leg = getBusLeg(seeded(), MONDAY_8AM, {
			stopId: '14013',
			direction: 'toUniversity',
			day: 'holiday',
		});
		expect(leg?.day).toBe('holiday');
		expect(leg?.todayDay).toBe('weekday');
		expect(leg?.departures.map((d) => d.time)).toEqual(['10:05']);
		expect(leg?.upcoming).toEqual([]);
	});

	it('未来大そのものと、一覧にない停留所は null', () => {
		expect(
			getBusLeg(seeded(), MONDAY_8AM, { stopId: '14023', direction: 'toUniversity' }),
		).toBeNull();
		expect(
			getBusLeg(seeded(), MONDAY_8AM, { stopId: '99999', direction: 'toUniversity' }),
		).toBeNull();
	});

	it('A の発車表が、まだなければ、発車を空にして返す', () => {
		const leg = getBusLeg(seeded(), MONDAY_8AM, { stopId: '11003', direction: 'toUniversity' });
		expect(leg).toMatchObject({ stop: { id: '11003' }, departures: [], upcoming: [] });
	});

	it('バスの機能を使わない設定では null', () => {
		const disabled: BusSources = {
			bus: null,
			holidays: { list: () => [] },
			estimateHolidays: () => [],
		};
		expect(
			getBusLeg(disabled, MONDAY_8AM, { stopId: '14013', direction: 'toUniversity' }),
		).toBeNull();
	});
});

describe('getBusLeg: 亀田支所前から路線が分かれるとき', () => {
	const ishikai = { id: '14011', name: '医師会病院前' };
	const stopsWithBranch = [...catalog.stops, ishikai];

	type Row = { time: string; destination: string; routes: string[]; via?: string };
	const table = (stop: { id: string; name: string }, rows: Row[]): BusStopTimetable => ({
		generatedAt: CHECKED.toISOString(),
		generation,
		stop,
		timetables: [
			{
				platformNo: 1,
				day: 'weekday',
				notes: [],
				departures: rows.map((row) => ({
					time: row.time,
					routes: row.routes,
					destination: row.destination,
					...(row.via === undefined ? {} : { via: row.via }),
					marks: [],
				})),
			},
			{ platformNo: 1, day: 'holiday', notes: [], departures: [] },
		],
	});

	function branched(): BusSources {
		const bus = createBusStore(database);
		bus.saveCatalog({ ...catalog, stops: stopsWithBranch }, null, CHECKED);
		// 医師会病院前は、五稜郭の側 (55A) にある。昭和の側の便 (55G) は、亀田支所前から先で合流する
		bus.saveTimetable(
			table(ishikai, [
				{
					time: '08:00',
					destination: '赤川',
					routes: ['55A'],
					via: '亀田支所前・はこだて未来大学',
				},
				{ time: '08:35', destination: '函館駅前', routes: ['55A'], via: '五稜郭' },
			]),
			null,
			CHECKED,
		);
		bus.saveTimetable(
			table(catalog.stops[0]!, [
				{ time: '08:10', destination: '赤川', routes: ['55A'], via: '赤川通・はこだて未来大学' },
				{ time: '08:40', destination: '赤川', routes: ['55G'], via: '赤川通・はこだて未来大学' },
				{ time: '08:25', destination: '函館駅前', routes: ['55A'], via: '五稜郭' },
				{ time: '08:55', destination: '昭和ターミナル', routes: ['55G'] },
			]),
			null,
			CHECKED,
		);
		bus.saveTimetable(
			table(catalog.stops[1]!, [
				{ time: '08:15', destination: '函館駅前', routes: ['55A'], via: '亀田支所前・五稜郭' },
				{ time: '08:30', destination: '赤川', routes: ['55A'] },
				{ time: '08:45', destination: '昭和ターミナル', routes: ['55G'], via: '亀田支所前' },
				{ time: '09:00', destination: '赤川', routes: ['55G'] },
			]),
			null,
			CHECKED,
		);
		return { bus, holidays: createHolidayStore(database), estimateHolidays: () => [] };
	}

	const MONDAY_7AM = new Date('2026-10-04T22:00:00Z');

	it('未来大へ: 選んだ停留所が通らない系統の便は、亀田支所前から未来大への便として足す', () => {
		const leg = getBusLeg(branched(), MONDAY_7AM, { stopId: '14011', direction: 'toUniversity' });
		expect(
			leg?.departures.map((d) => [
				d.time,
				d.arrivalTime,
				d.from.name,
				d.to.name,
				d.routes.join(' '),
			]),
		).toEqual([
			['08:00', '08:30', '医師会病院前', 'はこだて未来大学', '55A'],
			['08:40', '09:00', '亀田支所前', 'はこだて未来大学', '55G'],
		]);
	});

	it('未来大から: 同じく、未来大から亀田支所前までの便を足す', () => {
		const leg = getBusLeg(branched(), MONDAY_7AM, { stopId: '14011', direction: 'fromUniversity' });
		expect(
			leg?.departures.map((d) => [
				d.time,
				d.arrivalTime,
				d.from.name,
				d.to.name,
				d.routes.join(' '),
			]),
		).toEqual([
			['08:15', '08:35', 'はこだて未来大学', '医師会病院前', '55A'],
			['08:45', '08:55', 'はこだて未来大学', '亀田支所前', '55G'],
		]);
	});

	it('これからの発車にも、足した便が入り、近い順に並ぶ', () => {
		const leg = getBusLeg(branched(), MONDAY_7AM, {
			stopId: '14011',
			direction: 'toUniversity',
			limit: 2,
		});
		expect(leg?.upcoming.map((u) => [u.time, u.from.name])).toEqual([
			['08:00', '医師会病院前'],
			['08:40', '亀田支所前'],
		]);
	});

	it('亀田支所前そのものを選んだときは、足さない', () => {
		const leg = getBusLeg(branched(), MONDAY_7AM, { stopId: '14013', direction: 'toUniversity' });
		expect(leg?.departures.map((d) => d.from.name)).toEqual(['亀田支所前', '亀田支所前']);
	});
});

describe('getBusLeg: 向きごとにバス停コードが違う停留所', () => {
	// 昭和営業所前は、未来大へ向かう便のコードと、反対へ向かう便のコードが分かれている
	const towardStop = { id: '21001', name: '昭和営業所前' };
	const awayStop = { id: '21002', name: '昭和営業所前' };

	function seededSplitStop(): BusSources {
		const bus = createBusStore(database);
		bus.saveCatalog({ ...catalog, stops: [...catalog.stops, towardStop, awayStop] }, null, CHECKED);
		bus.saveTimetable(
			timetable(towardStop, [{ time: '07:40', destination: '赤川', via: 'はこだて未来大学' }]),
			null,
			CHECKED,
		);
		bus.saveTimetable(
			timetable(awayStop, [{ time: '08:40', destination: '昭和ターミナル' }]),
			null,
			CHECKED,
		);
		bus.saveTimetable(
			timetable(catalog.stops[1]!, [
				{ time: '08:00', destination: '赤川' },
				{ time: '08:25', destination: '昭和ターミナル' },
			]),
			null,
			CHECKED,
		);
		return { bus, holidays: createHolidayStore(database), estimateHolidays: () => [] };
	}

	it('どちらのコードを選んでも、未来大へ向かう便と、未来大から来る便の両方が出る', () => {
		const sources = seededSplitStop();
		for (const stopId of [towardStop.id, awayStop.id]) {
			const to = getBusLeg(sources, MONDAY_8AM, { stopId, direction: 'toUniversity' });
			const from = getBusLeg(sources, MONDAY_8AM, { stopId, direction: 'fromUniversity' });
			expect(
				to?.departures.map((d) => d.time),
				stopId,
			).toEqual(['07:40']);
			expect(
				from?.departures.map((d) => d.time),
				stopId,
			).toEqual(['08:25']);
			// 到着は、反対の向きのコードの発車表から結ぶ (08:40 の昭和ターミナル行き)
			expect(
				from?.departures.map((d) => d.arrivalTime),
				stopId,
			).toEqual(['08:40']);
		}
	});
});
