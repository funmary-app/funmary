// 授業の詳細。シラバスの内容は取り込み時に保存したものを出し、画面を開くたびに大学のサイトへは取りに行かない。
// シラバスにない授業として足した科目は、足した人と管理者が直したり消したりできる。
import { error, fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { getSubjectDetail, type SubjectDetail } from '@funmary/api';
import { canEditSubject } from '@funmary/core';
import type { SubjectVisibility } from '@funmary/db';
import { describeClassChange } from '#lib/class-change-label.ts';
import { parseSlotFields } from '#lib/server/course-form.ts';
import { getServices } from '#lib/server/services.ts';
import { parseAbbreviation, resolveSubjectAbbreviation } from '#lib/server/subject-abbreviation.ts';
import { alertSlotConflicts, alertSlotSubmission } from '#lib/server/slot-conflicts.ts';
import { readSlotSharingMode } from '#lib/server/slot-permission.ts';
import { alertSubjectDeleted, alertSubjectVisibilityChanged } from '#lib/server/subject-notify.ts';
import { findSameName, parseUserSubjectForm } from '#lib/server/user-subject.ts';
import { parseSubjectPath, subjectPathParams } from '#lib/subject-path.ts';
import { requireSignedIn } from '#lib/server/admin.ts';

/** 休講などの種類を、時間割の画面と同じ表示 (StatusBadge) にそろえる */
const CHANGE_STATUS = {
	cancellation: 'cancelled',
	makeup: 'makeup',
	roomChange: 'roomChanged',
} as const;

/** 画面に出すリンクは https のものだけにする (javascript: などを href に入れないため) */
const httpsOnly = (url: string | null) => (url?.startsWith('https://') ? url : null);

const VISIBILITIES: readonly SubjectVisibility[] = ['public', 'link', 'private'];

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** URL (/app/subjects/<年度>/<シラバスの番号>) の科目。なければ、見えなければ 404 */
function findSubject(
	params: Partial<Record<string, string>>,
	user: {
		readonly id: string;
		readonly email: string;
		readonly role: 'user' | 'moderator' | 'admin';
	},
): SubjectDetail {
	const key = parseSubjectPath(params);
	const detail = key && getSubjectDetail(getServices(), key, user);
	if (!detail) error(404, '科目が見つかりません');
	return detail;
}

export const load: ServerLoad = ({ locals, params }) => {
	requireSignedIn(locals);
	const { courses, personalSlots, settings, accessGrants } = getServices();
	const { subject, changes } = findSubject(params, locals.user);
	const canEdit = canEditSubject(subject, locals.user);

	const registration = courses
		.listRegistrations(locals.user.id)
		.find((r) => r.subjectId === subject.id);

	return {
		abbreviation: resolveSubjectAbbreviation(
			subject.name,
			getServices().subjectAbbreviations.get(locals.user.id, subject.id),
		),
		subject: {
			academicYear: subject.academicYear,
			name: subject.name,
			teacher: subject.teacher,
			credits: subject.credits,
			term: subject.term,
			attributes: Object.entries(subject.attributes),
			syllabus: Object.entries(subject.syllabus),
			syllabusUrl: httpsOnly(subject.syllabusUrl),
			userAdded: subject.source === 'user',
			visibility: subject.visibility,
		},
		canEdit,
		// 招待した人の一覧は、直せる人にだけ見せる
		grantedEmails: canEdit
			? accessGrants.list('subject', subject.id).map((g) => g.granteeEmail)
			: [],
		slots: courses
			.slotsOf(subject.id)
			.map(({ weekday, period, room }) => ({ weekday, period, room })),
		personalSlots: personalSlots.listForSubject(locals.user.id, subject.id),
		slotSharingMode: readSlotSharingMode(settings),
		registered: registration !== undefined,
		hopeCourseUrl: httpsOnly(registration?.hopeCourseUrl ?? null),
		changes: changes.map((change, index) => ({
			// 照合の結果、同じ日と時限に別の授業名の行が重なりうるので、並びの番号も入れる
			key: `${change.kind}-${change.date}-${change.period}-${index}`,
			date: change.date,
			period: change.period,
			comment: change.comment,
			withdrawn: change.withdrawn,
			status: CHANGE_STATUS[change.kind],
			...describeClassChange(change),
		})),
	};
};

export const actions: Actions = {
	saveAbbreviation: async ({ request, locals, params }) => {
		if (!locals.user) redirect(303, '/login');
		const { subject } = findSubject(params, locals.user);
		const parsed = parseAbbreviation((await request.formData()).get('abbreviation'));
		if (!parsed.ok) return fail(400, { error: parsed.error });
		getServices().subjectAbbreviations.set(locals.user.id, subject.id, parsed.value, new Date());
		return { message: '自分だけに使う略称を保存しました。' };
	},
	/**
	 * 曜日と時限を足す。履修登録していない科目でも、ログインしていれば誰でも足せる。
	 * 曜日と時限は、大学から自動では取れず、利用者どうしで登録して共有するため
	 */
	addSlot: async ({ request, locals, params }) => {
		requireSignedIn(locals);
		const { subject } = findSubject(params, locals.user);
		const parsed = parseSlotFields(await request.formData());
		if (!parsed.ok) return fail(400, { error: parsed.error });
		const services = getServices();
		const mode = readSlotSharingMode(services.settings);
		if (mode === 'closed') {
			return fail(403, {
				error:
					'今は共有の枠を登録できません。下の「自分だけに使う曜日と時限」から登録してください。',
			});
		}
		if (mode === 'moderated') {
			services.slotSubmissions.submit(
				{ subjectId: subject.id, ...parsed.value },
				locals.user.id,
				new Date(),
			);
			await alertSlotSubmission(services, subject.name);
			return {
				message: '曜日と時限を提出しました。モデレーターか管理者が確かめてから登録されます。',
			};
		}
		const result = services.courses.addSharedSlots(
			[{ subjectId: subject.id, ...parsed.value }],
			{ source: 'manual', createdBy: locals.user.id },
			new Date(),
		);
		if (result.conflicts.length > 0) {
			await alertSlotConflicts(services, result.conflicts);
			return fail(409, {
				error: 'この曜日と時限は、別の教室で登録されています。上書きはせず、管理者が確かめます。',
			});
		}
		if (result.added === 0 && result.updated === 0) {
			return { message: 'この曜日と時限は、既に登録されています。' };
		}
		return { message: '曜日と時限を登録しました。' };
	},

	/** 自分だけに使う曜日と時限を登録する。共有の登録の設定に関わらず、いつでも使える */
	addPersonalSlot: async ({ request, locals, params }) => {
		requireSignedIn(locals);
		const { subject } = findSubject(params, locals.user);
		const parsed = parseSlotFields(await request.formData());
		if (!parsed.ok) return fail(400, { error: parsed.error });
		getServices().personalSlots.set(locals.user.id, subject.id, parsed.value, new Date());
		return { message: '自分だけに使う曜日と時限を登録しました。' };
	},

	/** 自分だけの曜日と時限を消す */
	removePersonalSlot: async ({ request, locals, params }) => {
		requireSignedIn(locals);
		const { subject } = findSubject(params, locals.user);
		const form = await request.formData();
		const weekday = Number(form.get('weekday'));
		const period = Number(form.get('period'));
		if (!Number.isInteger(weekday) || !Number.isInteger(period)) {
			return fail(400, { error: '曜日と時限が正しくありません。' });
		}
		getServices().personalSlots.remove(locals.user.id, subject.id, weekday, period);
		return { message: '自分だけの曜日と時限を消しました。' };
	},

	/** シラバスにない授業の名前、学期、教員を直す (足した人と管理者だけ) */
	updateSubject: async ({ request, locals, params }) => {
		requireSignedIn(locals);
		const { subject } = findSubject(params, locals.user);
		if (!canEditSubject(subject, locals.user)) {
			return fail(403, { error: 'この科目は直せません。' });
		}
		const parsed = parseUserSubjectForm(await request.formData());
		if (!parsed.ok) return fail(400, { error: parsed.error });
		const { subjects } = getServices();
		const same = findSameName(
			parsed.value.name,
			subjects.list(subject.academicYear).filter((other) => other.id !== subject.id),
		);
		if (same) return fail(409, { error: `同じ名前の科目「${same.name}」があります。` });
		const now = new Date();
		subjects.updateUserSubject(subject.id, parsed.value, now);
		getServices().auditLog.record(
			{
				actorId: locals.user.id,
				action: 'subject.update',
				subjectId: subject.id,
				summary: `${subject.name} の情報を直した (${parsed.value.name})`,
			},
			now,
		);
		return { message: '授業を直しました。' };
	},
	/** シラバスにない授業の公開範囲を変える (足した人と管理者だけ)。#215 */
	setVisibility: async ({ request, locals, params }) => {
		requireSignedIn(locals);
		const { subject } = findSubject(params, locals.user);
		if (!canEditSubject(subject, locals.user)) {
			return fail(403, { error: 'この科目の公開範囲は変えられません。' });
		}
		const value = (await request.formData()).get('visibility');
		const visibility = VISIBILITIES.find((candidate) => candidate === value);
		if (!visibility) return fail(400, { error: '公開範囲を選んでください。' });
		const services = getServices();
		if (!services.subjects.setVisibility(subject.id, visibility)) {
			return fail(400, { error: '公開範囲を変えられませんでした。' });
		}
		const now = new Date();
		const label = { public: '全体公開', link: '限定公開', private: '非公開' }[visibility];
		services.auditLog.record(
			{
				actorId: locals.user.id,
				action: 'subject.visibility',
				subjectId: subject.id,
				summary: `${subject.name} の公開範囲を ${label} に変えた`,
			},
			now,
		);
		await alertSubjectVisibilityChanged(
			services,
			subject.name,
			subjectPathParams(subject),
			visibility,
		);
		return { message: `公開範囲を ${label} に変えました。` };
	},
	/**
	 * メールアドレスで、特定の人を招待する (足した人と管理者だけ)。#215
	 * そのメールアドレスの利用者がいるかどうかは確かめず、常に同じ案内を返す (存在を教えないため)
	 */
	grantAccess: async ({ request, locals, params }) => {
		requireSignedIn(locals);
		const { subject } = findSubject(params, locals.user);
		if (!canEditSubject(subject, locals.user)) {
			return fail(403, { error: 'この科目には招待できません。' });
		}
		const value = (await request.formData()).get('email');
		const email = typeof value === 'string' ? value.trim() : '';
		if (!EMAIL.test(email)) return fail(400, { error: 'メールアドレスを入れてください。' });
		getServices().accessGrants.grant('subject', subject.id, email, new Date());
		return { message: `${email} を招待しました。` };
	},
	/** 招待を外す */
	revokeAccess: async ({ request, locals, params }) => {
		requireSignedIn(locals);
		const { subject } = findSubject(params, locals.user);
		if (!canEditSubject(subject, locals.user)) {
			return fail(403, { error: 'この科目の招待は外せません。' });
		}
		const value = (await request.formData()).get('email');
		if (typeof value !== 'string') return fail(400, { error: '入力が足りません。' });
		getServices().accessGrants.revoke('subject', subject.id, value);
		return { message: `${value} の招待を外しました。` };
	},
	/** シラバスにない授業を消す。履修登録と時間割の枠も消える */
	deleteSubject: async ({ request, locals, params }) => {
		requireSignedIn(locals);
		const { subject } = findSubject(params, locals.user);
		if (!canEditSubject(subject, locals.user)) {
			return fail(403, { error: 'この科目は消せません。' });
		}
		if ((await request.formData()).get('confirm') !== 'on') {
			return fail(400, { error: '消すと元に戻せないことを確かめて、チェックを入れてください。' });
		}
		const services = getServices();
		services.auditLog.record(
			{
				actorId: locals.user.id,
				action: 'subject.delete',
				subjectId: subject.id,
				summary: `${subject.name} を、シラバスにない授業として消した`,
			},
			new Date(),
		);
		await alertSubjectDeleted(services, subject.name);
		services.subjects.deleteUserSubject(subject.id);
		services.accessGrants.revokeAll('subject', subject.id);
		redirect(303, '/app/courses');
	},
};
