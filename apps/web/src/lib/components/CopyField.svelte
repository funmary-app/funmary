<script lang="ts">
	import Button, { Label } from '@smui/button';
	import type { CopyState } from '#lib/clipboard.svelte.ts';
	import TextField from '#lib/components/TextField.svelte';

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

	let row: HTMLDivElement | undefined = $state();

	async function copy() {
		const ok = await copyState.copy(value);
		// コピーできないときは、欄を選んで、手でコピーしてもらう
		if (!ok) row?.querySelector('input')?.select();
	}
</script>

<div class="copy-row" style:--copy-field-basis={flexBasis} bind:this={row}>
	<TextField class="copy-field" {id} {label} readonly {value} selectOnFocus />
	<Button type="button" {variant} onclick={copy}>
		<Label>コピー</Label>
	</Button>
</div>

<style lang="scss">
	@use 'mixins';

	.copy-row {
		@include mixins.wrap-row(0.5rem);
		align-items: center;
		margin-top: 1rem;

		:global(.copy-field) {
			flex: 1 1 var(--copy-field-basis);
			min-width: 0;
		}

		:global(.copy-field .mdc-text-field__input) {
			font-family: ui-monospace, monospace;
			font-size: 0.875rem;
		}
	}
</style>
