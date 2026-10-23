<script lang="ts">
	// 選択欄と、そのラベル。スマホで OS の選択の画面を出し、JavaScript を増やさないよう、ブラウザの <select> のまま、
	// 見た目だけ TextField (SMUI の outlined の欄) にそろえる
	import type { Snippet } from 'svelte';
	import type { HTMLSelectAttributes } from 'svelte/elements';

	let {
		label,
		value = $bindable(),
		class: className = '',
		children,
		...rest
	}: {
		label: string;
		value?: string | number | null;
		/** 外側の枠に付けるクラス (幅を決めるときに使う) */
		class?: string;
		/** <option> の並び */
		children: Snippet;
	} & Omit<HTMLSelectAttributes, 'value' | 'class' | 'children'> = $props();

	const id = $props.id();
</script>

<div class="select-field {className}">
	<select {id} bind:value {...rest}>
		{@render children()}
	</select>
	<label for={id}>{label}</label>
	<!-- ラベルより狭い欄にしないよう、ラベルの幅を欄の幅に入れる -->
	<span class="sizer" aria-hidden="true">{label}</span>
	<!-- 枠の線。legend に同じ文字を見えないように入れ、ラベルの幅だけ上の線を切り欠く -->
	<fieldset aria-hidden="true">
		<legend><span>{label}</span></legend>
	</fieldset>
</div>

<style lang="scss">
	.select-field {
		position: relative;
		display: inline-grid;
		max-width: 100%;

		> select,
		> .sizer {
			grid-area: 1 / 1;
		}
	}

	.sizer {
		height: 0;
		padding: 0 20px;
		overflow: hidden;
		font-size: 0.75rem;
		white-space: nowrap;
		visibility: hidden;
	}

	select {
		width: 100%;
		min-width: 0;
		height: 56px;
		margin: 0;
		padding: 0 12px 0 16px;
		border: none;
		border-radius: 0.5rem;
		background: transparent;
		color: var(--fm-text);
		font: inherit;

		&:focus {
			outline: none;
		}

		&:disabled {
			color: var(--fm-text-muted);
			cursor: not-allowed;
		}
	}

	label {
		position: absolute;
		top: 0;
		left: 16px;
		max-width: calc(100% - 32px);
		overflow: hidden;
		color: var(--fm-text-muted);
		font-size: 0.75rem;
		line-height: 1;
		white-space: nowrap;
		text-overflow: ellipsis;
		transform: translateY(-50%);
		pointer-events: none;
	}

	// 上の線がラベルの高さの中ほど (欄の上端) に来るよう、legend の高さの半分だけ上に広げる
	fieldset {
		position: absolute;
		inset: -0.375rem 0 0;
		margin: 0;
		padding: 0 12px;
		border: 1px solid var(--fm-outline);
		border-radius: 0.5rem;
		pointer-events: none;
	}

	legend {
		max-width: 100%;
		height: 0.75rem;
		padding: 0;
		font-size: 0.75rem;
		line-height: 1;
		white-space: nowrap;
		visibility: hidden;

		span {
			padding: 0 4px;
		}
	}

	select:hover:enabled ~ fieldset {
		border-color: var(--fm-text);
	}

	select:focus ~ fieldset {
		border: 2px solid var(--fm-primary);
	}

	select:focus ~ label {
		color: var(--fm-primary);
	}

	select:disabled ~ fieldset {
		border-color: var(--fm-divider);
	}
</style>
