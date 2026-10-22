// 破壊的な操作 (削除、取り消し、退会など) の前に、確認のダイアログを出す Svelte のアクション。
// ダイアログは最上位のレイアウトの ConfirmDialog。JavaScript が無効なブラウザでは、確認なしでそのまま送信される
// (フォームの送信自体は動く)。
//
// use:enhance と同じ <form> に付けてよく、書く順は問わない。enhance は submit のリスナーを
// ふつうに (バブリングで) 登録し、ほかのリスナーが送信を止めたかを見ずに送信する。そこで、こちらは
// 捕捉 (capture) で登録する。イベントの対象の要素では、捕捉のリスナーが、登録の順に関係なく先に
// 呼ばれるので、stopImmediatePropagation で enhance の送信処理を必ず止められる。
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
