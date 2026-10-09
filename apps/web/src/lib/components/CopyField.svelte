<script lang="ts">
	import Button, { Label } from '@smui/button';
	import type { CopyState } from '#lib/clipboard.svelte.ts';

	let {
		id,
		label,
		value,
		copyState,
		variant = 'outlined',
		flexBasis = '10rem',
	}: {
		id: string;
		label: string;
		value: string;
		copyState: CopyState;
		variant?: 'outlined' | 'unelevated';
		flexBasis?: string;
	} = $props();

	let field: HTMLInputElement | undefined = $state();

	async function copy() {
		const ok = await copyState.copy(value);
		// コピーできないときは、欄を選んで、手でコピーしてもらう
		if (!ok) field?.select();
	}
</script>

<label for={id}>{label}</label>
<div class="copy-row" style:--copy-field-basis={flexBasis}>
	<input
		{id}
		bind:this={field}
		readonly
		{value}
		onfocus={(event) => event.currentTarget.select()}
	/>
	<Button type="button" {variant} onclick={copy}>
		<Label>コピー</Label>
	</Button>
</div>

<style lang="scss">
	@use 'mixins';

	label {
		display: block;
		margin-top: 1rem;
		font-size: 0.875rem;
	}

	.copy-row {
		@include mixins.wrap-row(0.5rem);
		margin-top: 0.25rem;

		input {
			flex: 1 1 var(--copy-field-basis);
			min-width: 0;
			min-height: 40px;
			padding: 0 0.5rem;
			font: inherit;
			font-family: ui-monospace, monospace;
			font-size: 0.875rem;
		}
	}
</style>
