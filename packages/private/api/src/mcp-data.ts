// Web 版の MCP ツールは、公開 API (REST) と同じ関数で DB を読み書きする。
import { jstDateTime } from '@funmary/core';
import {
	ambiguousMessage,
	FunmaryToolFailure,
	type CourseRef,
	type FunmaryData,
} from '@funmary/mcp';
import * as v from 'valibot';
import { getBusLeg, getBusStopTimetable, getNextBuses, listBusStops } from './reads/bus.ts';
import { listUserNotifications } from './reads/notifications.ts';
import {
	currentAcademicYear,
	getAcademicCalendar,
	getNextLesson,
	getPublicTimetable,
	getWeekGrid,
	listPeriods,
	listUserCourses,
} from './reads/public-data.ts';
import { getDataStatus, listUserEventOccurrences } from './reads/public-events.ts';
import { getSubjectSessions, searchSubjects } from './reads/public-subjects.ts';
import { getSubjectDetail } from './reads/subject-detail.ts';
import {
	registerCourse,
	removePersonalSlot,
	setAbbreviation,
	setPersonalSlot,
	unregisterCourse,
	type CourseWriteResult,
} from './writes/courses.ts';
import { EventBodySchema, type EventBody } from './writes/event-json.ts';
import {
	createEvent,
	deleteEvent,
	getEvent,
	replaceEvent,
	type WriteActor,
} from './writes/events.ts';
import { markAllNotificationsRead, markNotificationRead } from './writes/notifications.ts';
import type { V1RoutesDeps } from './v1/routes.ts';

/** MCP を呼んだトークンの持ち主。書き込みの履歴に、どのトークンからかを残す */
export interface McpWriteOwner {
	readonly userId: string;
	readonly scopes: readonly string[];
	readonly tokenId?: number;
	readonly tokenName?: string;
}

function parseEventBody(input: unknown): EventBody {
	const parsed = v.safeParse(EventBodySchema, input);
	if (!parsed.success) {
		throw new FunmaryToolFailure(parsed.issues[0]?.message ?? '入力が正しくありません');
	}
	return parsed.output;
}

/** 履修の書き込みの結果を、成功なら状態を返し、失敗なら、利用者に見せる文の例外にする */
function courseOrThrow(result: CourseWriteResult): object {
	if (result.ok) return result.course;
	throw new FunmaryToolFailure(
		result.kind === 'ambiguous' ? ambiguousMessage(result.error, result.candidates) : result.error,
	);
}

export function createServerData(deps: V1RoutesDeps, owner: McpWriteOwner): FunmaryData {
	const userId = owner.userId;
	const actor: WriteActor = {
		userId,
		tokenId: owner.tokenId ?? null,
		tokenName: owner.tokenName ?? 'MCP',
	};
	const viewer = () => {
		const user = deps.users.findUserById(userId);
		return user ? { id: user.id, email: user.email, role: user.role } : null;
	};
	const today = () => jstDateTime(new Date()).date;
	const now = () => new Date();
	const course = (ref: CourseRef) => ref;

	return {
		timetable: (range) => Promise.resolve(getPublicTimetable(deps, userId, range)),
		week: ({ date }) => Promise.resolve(getWeekGrid(deps, userId, date ?? today())),
		nextLesson: () => Promise.resolve(getNextLesson(deps, userId, now())),
		periods: () => Promise.resolve(listPeriods()),
		courses: () => Promise.resolve(listUserCourses(deps, userId)),
		academicCalendar: ({ year }) =>
			Promise.resolve(getAcademicCalendar(deps, year ?? currentAcademicYear(now()))),
		events: (range) => {
			const user = deps.users.findUserById(userId);
			return Promise.resolve(user ? listUserEventOccurrences(deps, user, range) : []);
		},
		event: (id) => Promise.resolve(getEvent(deps, userId, id)),
		status: () => Promise.resolve(getDataStatus(deps, now())),
		searchSubjects: ({ q, year, term }) =>
			Promise.resolve(
				searchSubjects(deps, { academicYear: year ?? currentAcademicYear(now()), q, term }),
			),
		subjectSessions: ({ year, syllabusId }) => {
			const user = viewer();
			return Promise.resolve(
				user ? getSubjectSessions(deps, { academicYear: year, syllabusId }, user) : null,
			);
		},
		subject: ({ year, syllabusId }) => {
			const user = viewer();
			return Promise.resolve(
				user ? getSubjectDetail(deps, { academicYear: year, syllabusId }, user) : null,
			);
		},
		notifications: ({ limit, afterId }) =>
			Promise.resolve(
				listUserNotifications(deps, userId, {
					...(limit === undefined ? {} : { limit }),
					...(afterId === undefined ? {} : { afterId }),
				}),
			),
		busStops: () => Promise.resolve(listBusStops(deps)),
		busStopTimetable: (stopId, generation) =>
			Promise.resolve(getBusStopTimetable(deps, now(), stopId, generation)),
		busLeg: (query) => Promise.resolve(getBusLeg(deps, now(), query)),
		busNext: (query) => Promise.resolve(getNextBuses(deps, now(), query)),

		createEvent: (body) => {
			const result = createEvent(deps, actor, parseEventBody(body), now());
			if (!result.ok) throw new FunmaryToolFailure(result.error);
			return Promise.resolve(result.event);
		},
		replaceEvent: (id, body) => {
			const result = replaceEvent(deps, actor, id, parseEventBody(body), now());
			if (!result.ok) throw new FunmaryToolFailure(result.error);
			return Promise.resolve(result.event);
		},
		deleteEvent: (id) => {
			const result = deleteEvent(deps, actor, id, now());
			if (!result.ok) throw new FunmaryToolFailure(result.error);
			return Promise.resolve();
		},
		registerCourse: (ref) =>
			Promise.resolve(courseOrThrow(registerCourse(deps, actor, course(ref), now()))),
		unregisterCourse: (ref) =>
			Promise.resolve(courseOrThrow(unregisterCourse(deps, actor, course(ref), now()))),
		setPersonalSlot: (ref, slot) =>
			Promise.resolve(courseOrThrow(setPersonalSlot(deps, actor, course(ref), slot, now()))),
		removePersonalSlot: (ref, slot) =>
			Promise.resolve(
				courseOrThrow(
					removePersonalSlot(deps, actor, course(ref), slot.weekday, slot.period, now()),
				),
			),
		setAbbreviation: (ref, abbreviation) =>
			Promise.resolve(
				courseOrThrow(setAbbreviation(deps, actor, course(ref), abbreviation, now())),
			),
		markNotificationRead: (id) => {
			const result = markNotificationRead(deps, actor, id, now());
			if (!result.ok) throw new FunmaryToolFailure(result.error);
			return Promise.resolve(result.notification);
		},
		markAllNotificationsRead: () =>
			Promise.resolve({ count: markAllNotificationsRead(deps, actor, now()).count }),
	};
}
