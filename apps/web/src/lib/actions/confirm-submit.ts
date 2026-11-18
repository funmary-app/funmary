// 破壊的な操作 (削除、取り消し、退会など) の前に、確認のダイアログを出す Svelte のアクション。
// JavaScript が無効なブラウザでは、確認を表示せずにフォームを送信する。

// use:enhance は、ほかのリスナーが送信を取り消したか確認せずに送信する。
// フォームに capture リスナーを登録すると、ディレクティブの順序にかかわらず use:enhance より先に呼ばれる。
// stopImmediatePropagation() で use:enhance にイベントが渡るのを防ぐ。
// 「続ける」が押されたら、同じボタンでもう一度送信する (このときは止めない)。
import { askConfirm } from '#lib/confirm-dialog.svelte.ts';

export function confirmSubmit(node: HTMLFormElement, message: string) {
	let currentMessage = message;
	let confirmed = false;
	const onSubmit = (event: SubmitEvent) => {
		if (confirmed) {
			confirmed = false;
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		const submitter = event.submitter ?? undefined;
		void askConfirm(currentMessage).then((accepted) => {
			if (!accepted || !node.isConnected) return;
			confirmed = true;
			node.requestSubmit(submitter);
		});
	};
	node.addEventListener('submit', onSubmit, { capture: true });
	return {
		update(newMessage: string) {
			currentMessage = newMessage;
		},
		destroy() {
			node.removeEventListener('submit', onSubmit, { capture: true });
		},
	};
}
