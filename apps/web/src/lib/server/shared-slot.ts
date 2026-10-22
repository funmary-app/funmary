import { fail } from '@sveltejs/kit';
import type { Services } from './services.ts';
import { alertSlotConflicts, alertSlotSubmission } from './slot-conflicts.ts';
import type { readSlotSharingMode } from './slot-permission.ts';

type SharedSlot = Parameters<Services['slotSubmissions']['submit']>[0];
type UserId = Parameters<Services['slotSubmissions']['submit']>[1];

/**
 * 利用者が登録した曜日と時限を、共有の設定に合わせて、確認待ちに提出するか、そのまま共有の枠に登録する。
 * 履修しているかの確認と、共有できない設定 (closed) の扱いは、画面ごとに案内が違うので呼ぶ側で行う
 */
export async function shareSlot(
	services: Services,
	mode: Exclude<ReturnType<typeof readSlotSharingMode>, 'closed'>,
	slot: SharedSlot,
	subjectName: string,
	userId: UserId,
) {
	if (mode === 'moderated') {
		services.slotSubmissions.submit(slot, userId, new Date());
		await alertSlotSubmission(services, subjectName);
		return {
			message: '曜日と時限を提出しました。モデレーターか管理者が確かめてから登録されます。',
		};
	}
	const result = services.courses.addSharedSlots(
		[slot],
		{ source: 'manual', createdBy: userId },
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
}
