// バス停の選択。「A から未来大へ」の A にする停留所を、一覧から選ぶ。選ぶと、Cookie に残して、バスの画面に戻る。
import { error, fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { listBusStops } from '@funmary/api';
import { UNIVERSITY_STOP, sameStopName, uniqueStopsByName } from '@funmary/core';
import { BUS_STOP_COOKIE } from '#lib/bus-state.ts';
import { requireSignedIn } from '#lib/server/admin.ts';
import { getServices } from '#lib/server/services.ts';

const ONE_YEAR_S = 365 * 24 * 60 * 60;

/** 未来大そのものは、選べない */
const selectableStops = () => {
	const listing = listBusStops(getServices());
	if (!listing) error(404, 'このサーバーでは、バスの時刻表を使っていません');
	return listing.stops.filter((stop) => stop.id !== UNIVERSITY_STOP.id);
};

export const load: ServerLoad = ({ locals, cookies }) => {
	requireSignedIn(locals);
	const all = selectableStops();
	// 一覧は、事業者のコードの順 (函館駅前の側から赤川の側へ、ほぼ路線の順に並ぶ)。
	// 向きごとにコードが分かれた停留所は、同じ名前で 2 つ並ぶので、1 つにする (どちらのコードでも、両方の向きの便が出る)
	const stops = uniqueStopsByName(
		all
			.map((stop) => ({ id: stop.id, name: stop.name }))
			.toSorted((a, b) => a.id.localeCompare(b.id)),
	);
	const saved = all.find((stop) => stop.id === cookies.get(BUS_STOP_COOKIE));
	return {
		stops,
		// 覚えているのが一覧から外したコードでも、同じ名前の停留所を選んでいることにする
		selectedStopId: saved
			? (stops.find((stop) => sameStopName(stop.name, saved.name))?.id ?? null)
			: null,
	};
};

export const actions: Actions = {
	select: async ({ request, locals, cookies, url }) => {
		requireSignedIn(locals);
		const stopId = (await request.formData()).get('stopId');
		if (typeof stopId !== 'string' || !selectableStops().some((stop) => stop.id === stopId)) {
			return fail(400, { error: '選んだバス停が見つかりません。' });
		}
		cookies.set(BUS_STOP_COOKIE, stopId, {
			path: '/',
			maxAge: ONE_YEAR_S,
			sameSite: 'lax',
			httpOnly: true,
			secure: url.protocol === 'https:',
		});
		redirect(303, '/app/bus');
	},
};
