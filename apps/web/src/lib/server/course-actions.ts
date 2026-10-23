// 履修登録と、自分だけの曜日と時限のフォームの処理。履修科目の画面と、時間割のコマの画面で使う
import { fail, type Action } from '@sveltejs/kit';
import { parseSlotForm, parseSubjectId } from '#lib/server/course-form.ts';
import { getServices } from '#lib/server/services.ts';
import { requireSignedIn } from '#lib/server/admin.ts';

export const registerCourse: Action = async ({ request, locals }) => {
	requireSignedIn(locals);
	const subjectId = parseSubjectId(await request.formData());
	const { courses, subjects } = getServices();
	const subject = subjectId === null ? null : subjects.findById(subjectId);
	if (!subject) return fail(400, { error: '科目が見つかりませんでした。探し直してください。' });
	courses.register(locals.user.id, subject.id, new Date());
	return { message: `${subject.name} を履修科目に登録しました。` };
};

export const unregisterCourse: Action = async ({ request, locals }) => {
	requireSignedIn(locals);
	const subjectId = parseSubjectId(await request.formData());
	const { courses, subjects } = getServices();
	if (subjectId === null || !courses.unregister(locals.user.id, subjectId)) {
		return fail(400, { error: 'この科目は履修科目に登録されていません。' });
	}
	const name = subjects.findById(subjectId)?.name ?? '科目';
	return { message: `${name} の登録を取り消しました。` };
};

/** 自分だけに使う曜日と時限を登録する。共有の登録の設定に関わらず、いつでも使える */
export const addPersonalSlot: Action = async ({ request, locals }) => {
	requireSignedIn(locals);
	const parsed = parseSlotForm(await request.formData());
	if (!parsed.ok) return fail(400, { error: parsed.error });
	const { subjectId, ...slot } = parsed.value;
	getServices().personalSlots.set(locals.user.id, subjectId, slot, new Date());
	return { message: '自分だけに使う曜日と時限を登録しました。' };
};

/** 自分だけの曜日と時限を消す */
export const removePersonalSlot: Action = async ({ request, locals }) => {
	requireSignedIn(locals);
	const form = await request.formData();
	const subjectId = parseSubjectId(form);
	const weekday = Number(form.get('weekday'));
	const period = Number(form.get('period'));
	if (subjectId === null || !Number.isInteger(weekday) || !Number.isInteger(period)) {
		return fail(400, { error: '曜日と時限が正しくありません。' });
	}
	getServices().personalSlots.remove(locals.user.id, subjectId, weekday, period);
	return { message: '自分だけの曜日と時限を消しました。' };
};
