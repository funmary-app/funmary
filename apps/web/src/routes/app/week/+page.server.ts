// 週の時間割。?date= で、その日を含む週を出す。省けば今週
import { redirect, type ServerLoad } from '@sveltejs/kit';
import { buildUserTimetable } from '@funmary/api';
import {
	DEFAULT_PERIODS,
	addDays,
	eachDate,
	isoWeekday,
	jstDateTime,
	startOfWeek,
} from '@funmary/core';
import { parseDateParam } from '#lib/server/date-param.ts';
import { eventViewsByDate } from '#lib/server/event-view.ts';
import { toLessonView, type LessonView } from '#lib/server/lesson-view.ts';
import { getServices } from '#lib/server/services.ts';
import { parseWeekView, WEEK_VIEW_COOKIE } from '#lib/week-view.ts';
import { ABBREVIATION_DISPLAY_COOKIE } from '#lib/abbreviation-display.ts';
import { resolveSubjectAbbreviation } from '#lib/server/subject-abbreviation.ts';
import { requireSignedIn } from '#lib/server/admin.ts';

export const load: ServerLoad = ({ cookies, locals, url }) => {
	requireSignedIn(locals);
	const today = jstDateTime(new Date()).date;
	const param = url.searchParams.get('date');
	const date = parseDateParam(param);
	if (param !== null && date === null) redirect(303, '/app/week');

	// 週は日曜から土曜。見出しと列は月曜から出す (日曜と土曜は、授業のあるときだけ列を出す)
	const sunday = startOfWeek(date ?? today);
	const monday = addDays(sunday, 1);
	const range = { start: sunday, end: addDays(sunday, 6) };
	const timetable = buildUserTimetable(getServices(), locals.user.id, range);
	const lessons = timetable.lessons.map(toLessonView);
	const personalAbbreviations = getServices().subjectAbbreviations.list(locals.user.id);
	const abbreviations = new Map(
		lessons.map((lesson) => [
			lesson.subjectId,
			resolveSubjectAbbreviation(lesson.subjectName, personalAbbreviations.get(lesson.subjectId)),
		]),
	);
	// 自分の予定 (日付ごと)。土日は、授業か予定のあるときだけ列を出す
	const { userEvents } = getServices();
	const addedEvents = userEvents.listSubscribed(locals.user);
	const events = eventViewsByDate(
		[...userEvents.listByOwner(locals.user.id), ...addedEvents],
		range.start,
		range.end,
		new Set(addedEvents.map((event) => event.id)),
	);

	// 月曜から金曜は必ず出し、土日は授業のある週だけ出す
	const days = [...eachDate(range.start, range.end)].filter(
		(day) =>
			isoWeekday(day) <= 5 || events.has(day) || lessons.some((lesson) => lesson.date === day),
	);
	const periods = [
		...new Set([
			...DEFAULT_PERIODS.map((period) => period.number),
			...lessons.map((lesson) => lesson.period),
		]),
	].sort((a, b) => a - b);
	const cells = new Map<string, LessonView[]>();
	for (const lesson of lessons) {
		const key = `${lesson.date}|${lesson.period}`;
		cells.set(key, [...(cells.get(key) ?? []), lesson]);
	}

	return {
		monday,
		previous: addDays(monday, -7),
		next: addDays(monday, 7),
		isThisWeek: sunday === startOfWeek(today),
		today,
		view: parseWeekView(cookies.get(WEEK_VIEW_COOKIE)),
		showAbbreviations: cookies.get(ABBREVIATION_DISPLAY_COOKIE) === 'on',
		abbreviations,
		days: days.map((day) => ({ date: day, note: timetable.notes.get(day) ?? null })),
		rows: periods.map((number) => {
			const period = DEFAULT_PERIODS.find((p) => p.number === number);
			return {
				period: number,
				start: period?.start ?? null,
				end: period?.end ?? null,
				cells: days.map((day) => ({
					date: day,
					lessons: cells.get(`${day}|${number}`) ?? [],
					events: (events.get(day) ?? []).filter((event) => event.startPeriod === number),
				})),
			};
		}),
		eventCells: days.map((day) => ({
			date: day,
			events: (events.get(day) ?? []).filter((event) => event.startPeriod === null),
		})),
		hasLessons: lessons.length > 0,
		usesEstimatedTerms: timetable.usesEstimatedTerms,
	};
};
