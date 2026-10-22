// 破壊的な操作の前に出す確認のダイアログの状態。ダイアログ (ConfirmDialog.svelte) は最上位のレイアウトに 1 つだけ置き、
// askConfirm で出して、押されたボタンを待つ。続けて呼ばれたら、前の確認は「やめる」として閉じる

interface PendingConfirm {
	message: string;
	resolve: (accepted: boolean) => void;
}

let pending = $state<PendingConfirm | null>(null);

/** いま出している確認 (なければ null) */
export const confirmDialog = {
	get message() {
		return pending?.message ?? null;
	},
};

/** 確認のダイアログを出し、「続ける」が押されたら true を返す */
export function askConfirm(message: string): Promise<boolean> {
	pending?.resolve(false);
	return new Promise((resolve) => {
		pending = { message, resolve };
	});
}

/** ダイアログが閉じたときに、押されたボタン (続けるなら true) を伝える */
export function answerConfirm(accepted: boolean) {
	pending?.resolve(accepted);
	pending = null;
}
