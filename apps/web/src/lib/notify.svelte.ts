// 操作がうまくいったことの短い知らせ。知らせ (NotifySnackbar.svelte) は最上位のレイアウトに 1 つだけ置き、notify で出す。
// 失敗の理由は、見落とさないよう、ここでは出さずに画面の中 (FormNotice) に残す

let current = $state<{ message: string; id: number } | null>(null);
let nextId = 0;

/** いま出す知らせ。同じ文言でも、出すたびに id が変わる */
export const notice = {
	get current() {
		return current;
	},
};

export function notify(message: string) {
	current = { message, id: nextId++ };
}
