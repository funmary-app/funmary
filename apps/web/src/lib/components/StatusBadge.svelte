<script lang="ts">
	import IconCancelled from '~icons/material-symbols/block';
	import IconMakeup from '~icons/material-symbols/event-available-outline';
	import IconRoomChanged from '~icons/material-symbols/swap-horiz';
	import { STATUS_LABELS } from '#lib/timetable-label.ts';

	// 休講などを、色に加えて文字とアイコンで示す。ふだんの授業には何も出さない
	let { status }: { status: 'normal' | 'cancelled' | 'makeup' | 'roomChanged' } = $props();

	const ICONS = { cancelled: IconCancelled, makeup: IconMakeup, roomChanged: IconRoomChanged };
</script>

{#if status !== 'normal'}
	{@const Icon = ICONS[status]}
	<span class={['badge', status]}>
		<Icon aria-hidden="true" />
		{STATUS_LABELS[status]}
	</span>
{/if}

<style lang="scss">
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0 0.5rem 0 0.375rem;
		border-radius: 0.375rem;
		font-weight: 700;
		font-size: 0.8125rem;
		line-height: 1.6;
		white-space: nowrap;
	}
	.badge :global(svg) {
		width: 1rem;
		height: 1rem;
	}
	.cancelled {
		color: var(--fm-cancelled);
		background: var(--fm-cancelled-soft);
	}
	.makeup {
		color: var(--fm-makeup);
		background: var(--fm-makeup-soft);
	}
	.roomChanged {
		color: var(--fm-room-changed);
		background: var(--fm-room-changed-soft);
	}
</style>
