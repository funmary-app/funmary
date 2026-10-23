<script lang="ts">
	// SMUI の入力欄 (outlined) と、そのラベル。フォームはブラウザの標準のまま送る (name などは中の input に付く)
	import { setContext } from 'svelte';
	import type { HTMLInputAttributes, HTMLTextareaAttributes } from 'svelte/elements';
	import Textfield from '@smui/textfield';

	// 日付と時刻の欄は、空でもブラウザが入力の案内 (yyyy/mm/dd など) を出すので、ラベルを常に上に置く
	const ALWAYS_FLOAT_TYPES = new Set(['date', 'time', 'datetime-local', 'month', 'week']);

	let {
		label,
		value = $bindable(''),
		type = 'text',
		textarea = false,
		required = false,
		disabled = false,
		selectOnFocus = false,
		class: className = '',
		...rest
	}: {
		label: string;
		value?: string | number | null;
		type?: string;
		/** 複数行の欄にする */
		textarea?: boolean;
		required?: boolean;
		disabled?: boolean;
		/** 押したら中身をすべて選ぶ (読むだけの、コピーしてもらう欄) */
		selectOnFocus?: boolean;
		/** 外側の枠に付けるクラス (幅を決めるときに使う) */
		class?: string;
	} & Omit<
		HTMLInputAttributes & HTMLTextareaAttributes,
		'value' | 'type' | 'class' | 'onfocus'
	> = $props();

	// SMUI は中の input への属性を input$ を付けた名前で受け取る
	const inputProps = $derived({
		...Object.fromEntries(Object.entries(rest).map(([key, prop]) => [`input$${key}`, prop])),
		...(selectOnFocus && {
			input$onfocus: (event: FocusEvent) => (event.currentTarget as HTMLInputElement).select(),
		}),
	});

	// 上に置いたラベルの分、枠を切り欠く幅は、SMUI が初期化のときに測る。ただ、そのときは枠の部品がまだなく、
	// 閉じた <details> や隠したタブの中では幅が 0 になる。SMUI のレイアウトし直す関数を受け取り、欄の大きさが変わるたびに呼ぶ
	let layouts: (() => void)[] = [];
	setContext('SMUI:addLayoutListener', (layout: () => void) => {
		layouts.push(layout);
		return () => (layouts = layouts.filter((other) => other !== layout));
	});

	function attach(root: HTMLElement) {
		const observer = new ResizeObserver(() => layouts.forEach((layout) => layout()));
		observer.observe(root);

		// フォームを送ったあとの reset で中身が戻ったら、ラベルの位置も合わせる
		const input = root.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
		const form = input?.form;
		const sync = () => setTimeout(() => (value = input?.value ?? ''));
		form?.addEventListener('reset', sync);

		return {
			destroy: () => {
				observer.disconnect();
				form?.removeEventListener('reset', sync);
			},
		};
	}
</script>

<div class="text-field {className}">
	<Textfield
		bind:value
		use={[attach]}
		variant="outlined"
		{label}
		{type}
		{textarea}
		{required}
		{disabled}
		{...ALWAYS_FLOAT_TYPES.has(type) ? { label$floatAbove: true } : {}}
		{...inputProps}
	/>
	<!-- SMUI の欄の幅は中の input の既定の幅で決まり、長いラベルが枠からはみ出す。ラベルの幅を欄の幅に入れる -->
	<span class="sizer" aria-hidden="true">{label}</span>
</div>

<style lang="scss">
	.text-field {
		display: inline-grid;
		max-width: 100%;

		> :global(.mdc-text-field),
		> .sizer {
			grid-area: 1 / 1;
		}
	}

	// 狭い画面では、欄の幅をラベルより狭くできる (ラベルは省略の印で切る)
	.sizer {
		height: 0;
		padding: 0 20px;
		overflow: hidden;
		font-size: 1rem;
		white-space: nowrap;
		visibility: hidden;
	}
</style>
