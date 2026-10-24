// 通知のチャネル (Discord の Webhook、Discord 連携) に届ける通知の種類の選択肢と、フォームの読み取り (#163)。
import type { NotificationKind } from '@funmary/db';

export const CHANNEL_KIND_OPTIONS: readonly { kind: NotificationKind; label: string }[] = [
	{ kind: 'cancellation', label: '休講' },
	{ kind: 'makeup', label: '補講' },
	{ kind: 'roomChange', label: '教室変更' },
	{ kind: 'integration', label: '連携の不具合' },
	{ kind: 'termStart', label: '学期の始まり' },
];

/** フォームの複数選択 (name="kinds") から、通知の種類を読む。1 つも選ばれていなければ null */
export function parseChannelKinds(form: FormData): NotificationKind[] | null {
	const chosen = form.getAll('kinds');
	const kinds = CHANNEL_KIND_OPTIONS.map((option) => option.kind).filter((kind) =>
		chosen.includes(kind),
	);
	return kinds.length > 0 ? kinds : null;
}
