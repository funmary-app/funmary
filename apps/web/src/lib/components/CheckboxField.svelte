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
</script>

<FormField>
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
