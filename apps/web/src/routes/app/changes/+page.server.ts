// 休講、補講、教室変更の一覧。既定は自分の履修科目の、今日からの分。?scope=all で全体、?when=past で過ぎた分を出す
import { type ServerLoad } from '@sveltejs/kit';
import { addDays, isStale, isSubjectSearchable, jstDateTime } from '@funmary/core';
import { PORTAL_SOURCE } from '@funmary/jobs';
import { CHANGE_STATUS, describeClassChange } from '#lib/class-change-label.ts';
import { getServices } from '#lib/server/services.ts';
import { requireSignedIn } from '#lib/server/admin.ts';
import { subjectPathParams } from '#lib/subject-path.ts';

/** 一覧に出す日数。ポータルの一覧は先の数週間分なので、学期の長さほどあれば足りる */
const RANGE_DAYS = 120;

export const load: ServerLoad = ({ locals, url }) => {
	requireSignedIn(locals);
	const scope = url.searchParams.get('scope') === 'all' ? 'all' : 'mine';
	const when = url.searchParams.get('when') === 'past' ? 'past' : 'upcoming';

	const now = new Date();
	const today = jstDateTime(now).date;
	const services = getServices();
	const listed =
		when === 'upcoming'
			? services.classChanges.listBetween(today, addDays(today, RANGE_DAYS - 1))
			: services.classChanges
					.listBetween(addDays(today, -RANGE_DAYS), addDays(today, -1))
					.reverse();
	const registered = new Set(
		services.courses.listRegistrations(locals.user.id).map(({ subjectId }) => subjectId),
	);

	const subjectCache = new Map<number, ReturnType<typeof services.subjects.findById>>();
	const subjectOf = (id: number) => {
		if (!subjectCache.has(id)) subjectCache.set(id, services.subjects.findById(id));
		return subjectCache.get(id) ?? null;
	};

	const changes = listed
		.filter(
			(change) =>
				scope === 'all' || (change.subjectId !== null && registered.has(change.subjectId)),
		)
		.map((change, index) => {
			const subject = change.subjectId === null ? null : subjectOf(change.subjectId);
			// 公開していない、利用者が足した科目は、ほかの人には詳細を開けないので、リンクにしない
			const linked = subject && (registered.has(subject.id) || isSubjectSearchable(subject));
			return {
				// 同じ日と時限に、別の授業名の行が重なりうるので、並びの番号も入れる
				key: `${change.kind}-${change.date}-${change.period}-${index}`,
				date: change.date,
				period: change.period,
				name: subject?.name ?? change.lessonName,
				path: linked ? subjectPathParams(subject) : null,
				status: CHANGE_STATUS[change.kind],
				comment: change.comment,
				...describeClassChange(change),
			};
		});

	// 日付ごとにまとめる (並びは、取り出した順のまま)
	const days: { date: string; changes: typeof changes }[] = [];
	for (const change of changes) {
		const last = days.at(-1);
		if (last?.date === change.date) last.changes.push(change);
		else days.push({ date: change.date, changes: [change] });
	}

	const portal = services.sourceHealth.load(PORTAL_SOURCE);
	return {
		scope,
		when,
		today,
		days,
		fetchedAt: portal.lastSuccessAt && jstDateTime(portal.lastSuccessAt),
		stale: isStale(portal.lastSuccessAt, now),
	};
};
