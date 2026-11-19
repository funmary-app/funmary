<script lang="ts">
	// SMUI のチェックボックスと、そのラベル。フォームはブラウザの標準のまま送る (name と value は中の input に付く)
	import type { Snippet } from 'svelte';
	import Checkbox from '@smui/checkbox';
	import FormField from '@smui/form-field';

	let {
		name,
		value,
		checked = $bindable(false),
		required = false,
		form,
		disabled = false,
		onchange,
		children,
	}: {
		name?: string;
		/** 送る値。省くと、ブラウザの既定と同じ "on" を送る (SMUI の既定の null のままだと、空の値になる) */
		value?: string | number;
		checked?: boolean;
		required?: boolean;
		/** フォームの外に置くときの、つなぐフォームの id */
		form?: string;
		disabled?: boolean;
		onchange?: (event: Event) => void;
		children: Snippet;
	} = $props();

	// サーバーとブラウザで同じになる id。ラベルと欄をつなぎ、下で、サーバーが描いた欄を探すのにも使う
	const inputId = $props.id();

	// 画面の準備 (hydration) では、欄が checked の初めの値に戻される。通信が遅いと、その前に利用者がチェックを入れていることが
	// あるので、サーバーが描いた欄の今の状態を引き継ぐ。画面の移動で新しく作るときは、まだ欄がないので何もしない
	if (typeof document !== 'undefined') {
		const rendered = document.getElementById(inputId);
		if (rendered instanceof HTMLInputElement) checked = rendered.checked;
	}
</script>

<FormField {inputId}>
	<Checkbox
		bind:checked
		value={value ?? 'on'}
		{disabled}
		input$name={name}
		input$required={required}
		input$form={form}
		input$onchange={onchange}
	/>
	{#snippet label()}{@render children()}{/snippet}
</FormField>
