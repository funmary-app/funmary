/**
 * サーバーの値を初めの値にして、画面で選び直せる値。選び直した値は、サーバーから同じ値が読み直されただけでは戻さず
 * (同じ画面のほかのフォームを送ると、data が読み直される)、サーバーの値そのものが変わったときだけ、サーバーに合わせる。
 * 書き換えられる $derived は、読み直しのたびに選び直した値をサーバーの値に戻してしまう
 */
export function serverChoice<T>(server: () => T) {
	/** 選び直した値と、そのときのサーバーの値 */
	let chosen = $state<{ value: T; from: T } | undefined>();
	const current = $derived.by(() => {
		const latest = server();
		return chosen !== undefined && Object.is(chosen.from, latest) ? chosen.value : latest;
	});
	return {
		get value() {
			return current;
		},
		set value(value: T) {
			chosen = { value, from: server() };
		},
	};
}
