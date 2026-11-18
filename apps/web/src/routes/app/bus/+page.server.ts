// バスの時刻表。「A から未来大へ」「未来大から A へ」の発車だけを出す (A は、未来大を通る任意の停留所)。
// 選んだ停留所と日の種類は Cookie に置き、サーバーが画面に入れて返す (週の時間割の見せ方と同じ作り)。
// 向きと日の種類の切り替えで読み直さないよう、選んだ停留所の 2 つの向きと 2 つの日の種類を、まとめて返す。
// 向きは保存せず、接続元が設定された学内ネットワークの範囲なら未来大発、学外なら未来大行きにする。
// 現在地による判定はブラウザ側で行う。
// 保存した写しだけを読む。BUS_API_BASE_URL がないサーバーでは、この画面はない
import { error, type ServerLoad } from '@sveltejs/kit';
import { getBusLeg, listBusStops, type PublicBusLeg } from '@funmary/api';
import {
	BUS_DIRECTIONS,
	UNIVERSITY_STOP,
	jstDateTime,
	type BusDayType,
	type BusDirection,
} from '@funmary/core';
import { isBusDataStale } from '#lib/bus-label.ts';
import { BUS_DAY_COOKIE, BUS_STOP_COOKIE, parseBusDay } from '#lib/bus-state.ts';
import { requireSignedIn } from '#lib/server/admin.ts';
import { chooseBusStopId, defaultBusDirection } from '#lib/server/bus-selection.ts';
import { getServices } from '#lib/server/services.ts';

const BUS_DAYS: readonly BusDayType[] = ['weekday', 'holiday'];

export const load: ServerLoad = ({ locals, cookies, getClientAddress }) => {
	requireSignedIn(locals);
	const services = getServices();
	const now = new Date();
	const listing = listBusStops(services);
	if (!listing) error(404, 'このサーバーでは、バスの時刻表を使っていません');

	// 未来大そのものは、A にならない
	const selectable = listing.stops.filter((stop) => stop.id !== UNIVERSITY_STOP.id);
	const stopId = chooseBusStopId(
		cookies.get(BUS_STOP_COOKIE),
		selectable.map((stop) => stop.id),
	);
	const { direction: defaultDirection, onCampus } = defaultBusDirection(
		getClientAddress,
		services.campus.ranges(),
	);

	const legs = Object.fromEntries(
		BUS_DIRECTIONS.map((direction) => [
			direction,
			Object.fromEntries(
				BUS_DAYS.map((day) => [
					day,
					stopId ? getBusLeg(services, now, { stopId, direction, day }) : null,
				]),
			),
		]),
	) as Record<BusDirection, Record<BusDayType, PublicBusLeg | null>>;
	const anyLeg = BUS_DIRECTIONS.flatMap((direction) =>
		BUS_DAYS.map((day) => legs[direction][day]),
	).find((leg) => leg !== null);
	const todayDay = anyLeg?.todayDay ?? 'weekday';

	return {
		stopId,
		/** 学内の Wi-Fi で決めた、はじめの向き。画面の中で入れ替えられる */
		defaultDirection,
		/** 学内の Wi-Fi で決まったときは、現在地で決め直さない */
		canDecideByLocation: !onCampus,
		/** 選んだ日の種類 (その日のうちだけ覚えている)。なければ今日の種類 */
		day: parseBusDay(cookies.get(BUS_DAY_COOKIE)) ?? todayDay,
		todayDay,
		legs,
		universityName: UNIVERSITY_STOP.name,
		/** いまの日本時間 (HH:MM)。発車の済んだ便を薄く出すのに使う */
		nowTime: jstDateTime(now).time,
		stale: isBusDataStale(listing.checkedAt, now),
		hasStops: selectable.length > 0,
	};
};
