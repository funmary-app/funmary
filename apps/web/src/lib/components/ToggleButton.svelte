<script lang="ts">
	let {
		label,
		checked,
		disabled = false,
		onchange,
	}: {
		label: string;
		checked: boolean;
		disabled?: boolean;
		onchange: (checked: boolean) => void;
	} = $props();
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	{disabled}
	onclick={() => onchange(!checked)}
>
	<span>{label}</span>
	<span class="track" aria-hidden="true"><span class="thumb"></span></span>
</button>

<style lang="scss">
	@use 'toolbar-button';

	button {
		@include toolbar-button.base;
		flex-shrink: 0;
		gap: 0.5rem;
		padding: 0 1rem;
		white-space: nowrap;
	}

	button:disabled {
		opacity: 0.38;
		cursor: default;
	}

	.track {
		position: relative;
		flex-shrink: 0;
		width: var(--fm-switch-width, 52px);
		height: var(--fm-switch-height, 32px);
		border: 2px solid var(--fm-switch-outline, var(--fm-text-muted));
		border-radius: 999px;
		background: var(--fm-switch-track, var(--fm-surface-muted));
		transition:
			background-color 150ms ease-out,
			border-color 150ms ease-out;
	}

	.thumb {
		position: absolute;
		top: 50%;
		left: 6px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--fm-switch-thumb, var(--fm-text-muted));
		transform: translateY(-50%);
		transition:
			left 150ms ease-out,
			width 150ms ease-out,
			height 150ms ease-out;
	}

	button[aria-checked='true'] {
		.track {
			border-color: var(--fm-switch-selected-track, var(--fm-primary));
			background: var(--fm-switch-selected-track, var(--fm-primary));
		}
		.thumb {
			left: calc(100% - 26px);
			width: 24px;
			height: 24px;
			background: var(--fm-switch-selected-thumb, var(--fm-on-button));
		}
	}

	@media (prefers-reduced-motion: reduce) {
		button,
		.track,
		.thumb {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.track {
			border-color: ButtonText;
		}
		.thumb {
			background: ButtonText;
		}
		button[aria-checked='true'] .track {
			background: Highlight;
		}
		button[aria-checked='true'] .thumb {
			background: HighlightText;
		}
	}
</style>
