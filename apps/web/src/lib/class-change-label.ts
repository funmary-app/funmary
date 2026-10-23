import { CLASS_CHANGE_KIND_LABELS } from '@funmary/core';
import type { SubjectClassChange } from '@funmary/db';

const MAKEUP_PLAN_LABELS = {
	planned: '補講あり',
	none: '補講なし',
	undecided: '補講未定',
} as const;

/** 休講などの種類ごとの、StatusBadge に渡す状態 */
export const CHANGE_STATUS = {
	cancellation: 'cancelled',
	makeup: 'makeup',
	roomChange: 'roomChanged',
} as const;

/** 休講などの、画面に出すラベル (色だけで伝えないため、必ず文字で出す) と、添える説明 */
export function describeClassChange(
	change: Pick<SubjectClassChange, 'kind' | 'room' | 'fromRoom' | 'makeupPlan'>,
): {
	label: string;
	detail: string | null;
} {
	const label = CLASS_CHANGE_KIND_LABELS[change.kind];
	switch (change.kind) {
		case 'cancellation':
			return { label, detail: change.makeupPlan ? MAKEUP_PLAN_LABELS[change.makeupPlan] : null };
		case 'makeup':
			return { label, detail: change.room };
		case 'roomChange':
			if (change.room === null) return { label, detail: null };
			return {
				label,
				detail: change.fromRoom ? `${change.fromRoom} から ${change.room} へ` : `${change.room} へ`,
			};
	}
}
