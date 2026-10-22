<script lang="ts">
	// SMUI のラジオボタンと、そのラベル。同じ name のものは、同じ変数を bind:group に渡して 1 つの組にする。
	// フォームはブラウザの標準のまま送る (name と value は中の input に付く)
	import type { Snippet } from 'svelte';
	import FormField from '@smui/form-field';
	import Radio from '@smui/radio';

	let {
		name,
		value,
		group = $bindable(),
		required = false,
		form,
		disabled = false,
		onchange,
		children,
	}: {
		name: string;
		value: string | number;
		/** 組の中で選ばれている値 */
		group?: string | number | null;
		required?: boolean;
		/** フォームの外に置くときの、つなぐフォームの id */
		form?: string;
		disabled?: boolean;
		onchange?: (event: Event) => void;
		children: Snippet;
	} = $props();
</script>

<FormField>
	<Radio
		bind:group
		{value}
		{disabled}
		input$name={name}
		input$required={required}
		input$form={form}
		input$onchange={onchange}
	/>
	{#snippet label()}{@render children()}{/snippet}
</FormField>
