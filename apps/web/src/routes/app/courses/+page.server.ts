// 履修科目の登録。科目を探して登録し、曜日と時限が分からない科目には、利用者が手で枠を足す。
// 枠は科目ごとに共有するので、既にある枠は上書きしない。教室が食い違えば、管理者に知らせる。
import { fail, type Actions, type ServerLoad } from '@sveltejs/kit';
import { isSubjectSearchable, jstDateTime, resolveAcademicTerms } from '@funmary/core';
import { parseSlotForm } from '#lib/server/course-form.ts';
import {
	addPersonalSlot,
	registerCourse,
	removePersonalSlot,
	unregisterCourse,
} from '#lib/server/course-actions.ts';
import { getServices } from '#lib/server/services.ts';
import { shareSlot } from '#lib/server/shared-slot.ts';
import { readSlotSharingMode } from '#lib/server/slot-permission.ts';
import { alertSubjectPublished } from '#lib/server/subject-notify.ts';
import { findSameName, parseUserSubjectForm } from '#lib/server/user-subject.ts';
import { subjectPathParams } from '#lib/subject-path.ts';
import { searchSubjects } from '#lib/subject-search.ts';
import { requireSignedIn } from '#lib/server/admin.ts';

export const load: ServerLoad = ({ locals, url }) => {
	requireSignedIn(locals);
	const userId = locals.user.id;
	const { courses, subjects, settings, personalSlots } = getServices();
	const slotSharingMode = readSlotSharingMode(settings);
	// 新年度のシラバスがまだなければ、前年度の科目を使い続ける
	const academicYear = subjects.latestYear();
	// シラバスにない授業を足すときの学期の既定。4 月から 8 月は前期、それ以外は後期
	const month = Number(jstDateTime(new Date()).date.slice(5, 7));
	const defaultTerm = month >= 4 && month <= 8 ? 'spring' : 'fall';
	if (academicYear === null) {
		return {
			academicYear: null,
			registered: [],
			query: '',
			results: [],
			defaultTerm,
			slotSharingMode,
		};
	}

	// 学年暦に期間がない学期 (集中講義など) の科目は、時間割のどの日にも出ない。画面で知らせる
	const termsWithPeriod = new Set(
		resolveAcademicTerms(academicYear, getServices().academicCalendar.listTerms(academicYear)).map(
			(period) => period.term,
		),
	);
	const registered = courses
		.listRegistrations(userId)
		.flatMap(({ subjectId }) => {
			const subject = subjects.findById(subjectId);
			if (subject?.academicYear !== academicYear) return [];
			return [
				{
					id: subject.id,
					name: subject.name,
					teacher: subject.teacher,
					term: subject.term,
					userAdded: subject.source === 'user',
					noPeriod: !termsWithPeriod.has(subject.term as never),
					path: subjectPathParams(subject),
					slots: courses
						.slotsOf(subject.id)
						.map(({ weekday, period, room }) => ({ weekday, period, room })),
					personalSlots: personalSlots.listForSubject(userId, subject.id),
				},
			];
		})
		.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

	const query = (url.searchParams.get('q') ?? '').slice(0, 100);
	const registeredIds = new Set(registered.map((subject) => subject.id));
	const results = searchSubjects(
		subjects
			.list(academicYear)
			.filter((subject) => !registeredIds.has(subject.id) && isSubjectSearchable(subject)),
		query,
	).map((subject) => ({
		id: subject.id,
		name: subject.name,
		teacher: subject.teacher,
		term: subject.term,
		userAdded: subject.source === 'user',
		path: subjectPathParams(subject),
	}));

	return { academicYear, registered, query, results, defaultTerm, slotSharingMode };
};

export const actions: Actions = {
	register: registerCourse,

	/** シラバスにない授業を科目として足し、足した人の履修科目に登録する */
	createSubject: async ({ request, locals }) => {
		requireSignedIn(locals);
		const parsed = parseUserSubjectForm(await request.formData());
		if (!parsed.ok) return fail(400, { error: parsed.error });
		const { courses, subjects } = getServices();
		const academicYear = subjects.latestYear();
		if (academicYear === null) {
			return fail(400, { error: '科目がまだ取り込まれていないので、足せません。' });
		}
		const same = findSameName(parsed.value.name, subjects.list(academicYear));
		if (same) {
			return fail(409, {
				error: `同じ名前の科目「${same.name}」があります。「科目を探す」から登録してください。`,
			});
		}
		const now = new Date();
		const id = subjects.createUserSubject({ academicYear, ...parsed.value }, locals.user.id, now);
		courses.register(locals.user.id, id, now);
		const services = getServices();
		services.auditLog.record(
			{
				actorId: locals.user.id,
				action: 'subject.create',
				subjectId: id,
				summary: `${parsed.value.name} を、シラバスにない授業として足した`,
			},
			now,
		);
		// 足したばかりの科目は、既定で公開範囲が public (全体公開) になる
		const created = subjects.findById(id);
		if (created) await alertSubjectPublished(services, created.name, subjectPathParams(created));
		return {
			message: `${parsed.value.name} を足して、履修科目に登録しました。曜日と時限を登録してください。`,
		};
	},

	unregister: unregisterCourse,

	addSlot: async ({ request, locals }) => {
		requireSignedIn(locals);
		const parsed = parseSlotForm(await request.formData());
		if (!parsed.ok) return fail(400, { error: parsed.error });
		const services = getServices();
		// 履修していない科目の枠は足させない (ほかの利用者の時間割にも使われるため)
		if (!services.courses.isRegistered(locals.user.id, parsed.value.subjectId)) {
			return fail(403, { error: '履修科目に登録した科目だけ、曜日と時限を登録できます。' });
		}
		const mode = readSlotSharingMode(services.settings);
		if (mode === 'closed') {
			return fail(403, {
				error:
					'今は共有の枠を登録できません。科目の詳細画面から、自分だけに使う曜日と時限を登録してください。',
			});
		}
		const subject = services.subjects.findById(parsed.value.subjectId);
		return shareSlot(
			services,
			mode,
			parsed.value,
			subject?.name ?? `科目 ${parsed.value.subjectId}`,
			locals.user.id,
		);
	},

	addPersonalSlot,
	removePersonalSlot,
};
