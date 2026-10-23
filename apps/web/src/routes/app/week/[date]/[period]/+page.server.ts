// 時間割の 1 つのコマ (日付と時限)。そのコマの履修科目と、そのコマに共有の枠がある科目を出し、登録と取り消しをする。
// 振替授業日は、その日に行う曜日のコマとして扱う
import { redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { buildUserTimetable } from '@funmary/api';
import {
	DEFAULT_PERIODS,
	academicYearOf,
	isSubjectSearchable,
	isoWeekday,
	resolveAcademicTerms,
	termsOn,
} from '@funmary/core';
import {
	addPersonalSlot,
	registerCourse,
	removePersonalSlot,
	unregisterCourse,
} from '#lib/server/course-actions.ts';
import { parseDateParam } from '#lib/server/date-param.ts';
import { getServices } from '#lib/server/services.ts';
import { requireSignedIn } from '#lib/server/admin.ts';
import { subjectPathParams } from '#lib/subject-path.ts';

export const load: ServerLoad = ({ locals, params }) => {
	requireSignedIn(locals);
	const date = parseDateParam(params['date'] ?? null);
	const period = Number(params['period']);
	if (date === null || !Number.isInteger(period) || period < 1 || period > DEFAULT_PERIODS.length) {
		redirect(303, '/app/week');
	}

	const services = getServices();
	const { courses, subjects, personalSlots } = services;
	const userId = locals.user.id;
	const timetable = buildUserTimetable(services, userId, { start: date, end: date });
	const note = timetable.notes.get(date) ?? null;
	const weekday = note?.kind === 'substitute' ? note.weekday : isoWeekday(date);

	// このコマに出ている履修科目。自分だけの曜日と時限で出ているものは、このコマから外せる
	const lessons = timetable.lessons.filter((lesson) => lesson.period === period);
	const registered = [...new Map(lessons.map((lesson) => [lesson.subjectId, lesson])).values()].map(
		(lesson) => ({
			id: lesson.subjectId,
			name: lesson.subjectName,
			path: subjectPathParams(lesson),
			status: lesson.status,
			personal: personalSlots
				.listForSubject(userId, lesson.subjectId)
				.some((slot) => slot.weekday === weekday && slot.period === period),
		}),
	);

	// このコマに共有の枠があり、その日に行われる学期の、まだ履修していない科目
	const academicYear = academicYearOf(date);
	const terms: readonly string[] = termsOn(
		resolveAcademicTerms(academicYear, services.academicCalendar.listTerms(academicYear)),
		date,
	);
	const registeredIds = new Set(courses.listRegistrations(userId).map((r) => r.subjectId));
	const candidates = courses
		.subjectsAt(weekday, period)
		.flatMap((id) => {
			const subject = subjects.findById(id);
			return subject &&
				subject.academicYear === academicYear &&
				terms.includes(subject.term) &&
				isSubjectSearchable(subject) &&
				!registeredIds.has(subject.id)
				? [
						{
							id: subject.id,
							name: subject.name,
							teacher: subject.teacher,
							path: subjectPathParams(subject),
							rooms: courses
								.slotsOf(subject.id)
								.filter((slot) => slot.weekday === weekday && slot.period === period)
								.flatMap((slot) => (slot.room ? [slot.room] : [])),
						},
					]
				: [];
		})
		.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

	// このコマに出ていない履修科目。自分だけの曜日と時限として、このコマに足せる
	const shown = new Set(registered.map((subject) => subject.id));
	const others = [...registeredIds]
		.flatMap((id) => {
			const subject = subjects.findById(id);
			return subject?.academicYear === academicYear && !shown.has(id)
				? [{ id, name: subject.name }]
				: [];
		})
		.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

	return { date, period, weekday, note, registered, candidates, others };
};

export const actions: Actions = {
	register: registerCourse,
	unregister: unregisterCourse,
	addPersonalSlot,
	removePersonalSlot,
};
