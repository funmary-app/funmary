// ローカルの MCP サーバーは、@funmary/client 経由で公開 API (REST) を呼ぶ。
import { FunmaryApiError, type FunmaryClient } from '@funmary/client';
import { ambiguousMessage, FunmaryToolFailure, type CourseRef, type FunmaryData } from './data.ts';

/** 404 を「見つからない」(null) にする。ほかの誤りは、そのまま投げる */
async function orNull<T extends object>(read: Promise<T>): Promise<T | null> {
	try {
		return await read;
	} catch (error) {
		if (error instanceof FunmaryApiError && error.status === 404) return null;
		throw error;
	}
}

type Subject = { academicYear: number; syllabusId: string; name: string };

export function createClientData(client: FunmaryClient): FunmaryData {
	/**
	 * 書き込みの API は、年度とシラバスの番号で科目を指す。名前で指されたときは、科目の検索で、番号に直す。
	 * 完全に一致する科目が 1 つならそれを、なければ部分一致が 1 つならそれを選び、複数なら、候補つきで断る
	 */
	async function resolve(ref: CourseRef): Promise<{ year: number; syllabusId: string }> {
		if ('syllabusId' in ref) return { year: ref.academicYear, syllabusId: ref.syllabusId };
		const needle = ref.name.trim().toLowerCase();
		const found = (await client.subjects.search({ q: ref.name, year: ref.academicYear }))
			.subjects as Subject[];
		const exact = found.filter((subject) => subject.name.trim().toLowerCase() === needle);
		const matched = exact.length > 0 ? exact : found;
		const [only] = matched;
		if (matched.length === 1 && only)
			return { year: only.academicYear, syllabusId: only.syllabusId };
		if (matched.length === 0) throw new FunmaryToolFailure('科目が見つかりません');
		throw new FunmaryToolFailure(
			ambiguousMessage(
				`「${ref.name}」に当たる科目が ${matched.length} 件あります。年度とシラバスの番号で指してください`,
				matched.toSorted((a, b) => a.syllabusId.localeCompare(b.syllabusId)).slice(0, 10),
			),
		);
	}

	return {
		timetable: (range) => client.timetable(range),
		week: (query) => client.week(query.date === undefined ? {} : { date: query.date }),
		nextLesson: () => client.nextLesson(),
		periods: () => client.periods(),
		courses: () => client.courses.list(),
		academicCalendar: (query) =>
			client.academicCalendar(query.year === undefined ? {} : { year: query.year }),
		events: (range) => client.events.list(range),
		event: (id) => orNull(client.events.get(id)),
		status: () => client.status(),
		searchSubjects: (query) => client.subjects.search(query),
		subjectSessions: (ref) => orNull(client.subjects.sessions(ref)),
		subject: (ref) => orNull(client.subjects.get(ref)),
		notifications: (query) => client.notifications.list(query),
		busStops: () => orNull(client.bus.stops()),
		busStopTimetable: (stopId, generation) =>
			orNull(client.bus.stop(stopId, generation === undefined ? {} : { generation })),
		busLeg: (query) =>
			orNull(
				client.bus.legs({
					stopId: query.stopId,
					direction: query.direction,
					...(query.day === undefined ? {} : { day: query.day }),
					...(query.limit === undefined ? {} : { limit: query.limit }),
				}),
			),
		busNext: (query) =>
			orNull(
				client.bus.next({
					...(query.stopId === undefined ? {} : { stopId: query.stopId }),
					...(query.limit === undefined ? {} : { limit: query.limit }),
				}),
			),

		createEvent: (body) =>
			client.events.create(body as Parameters<FunmaryClient['events']['create']>[0]),
		replaceEvent: (id, body) =>
			client.events.replace(id, body as Parameters<FunmaryClient['events']['create']>[0]),
		deleteEvent: (id) => client.events.delete(id).then(() => undefined),
		registerCourse: (ref) =>
			client.courses.register(
				'syllabusId' in ref
					? { academicYear: ref.academicYear, syllabusId: ref.syllabusId }
					: {
							name: ref.name,
							...(ref.academicYear === undefined ? {} : { academicYear: ref.academicYear }),
						},
			),
		unregisterCourse: async (ref) => client.courses.unregister(await resolve(ref)),
		setPersonalSlot: async (ref, slot) =>
			client.courses.setPersonalSlot(await resolve(ref), {
				weekday: slot.weekday,
				period: slot.period,
				room: slot.room ?? null,
			}),
		removePersonalSlot: async (ref, slot) =>
			client.courses.removePersonalSlot(await resolve(ref), slot),
		setAbbreviation: async (ref, abbreviation) =>
			client.courses.setAbbreviation(await resolve(ref), abbreviation),
		markNotificationRead: (id) => client.notifications.markRead(id),
		markAllNotificationsRead: () => client.notifications.markAllRead(),
	};
}
