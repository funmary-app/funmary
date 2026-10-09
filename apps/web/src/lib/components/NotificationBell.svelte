<script lang="ts">
	import { resolve } from '$app/paths';
	import IconNotifications from '~icons/material-symbols/notifications-outline';

	let { unread, compact = false }: { unread: number; compact?: boolean } = $props();

	/** 3 桁以上は 99+ にまとめ、バッジの幅を抑える */
	const badge = $derived(unread > 99 ? '99+' : String(unread));
</script>

<a
	href={resolve('app/notifications')}
	class={['bell', { compact }]}
	aria-label={unread > 0 ? `通知 (未読 ${unread} 件)` : '通知'}
>
	<span class="icon-wrap">
		<IconNotifications aria-hidden="true" class="icon" />
		{#if unread > 0}
			<span class="badge" aria-hidden="true">{badge}</span>
		{/if}
	</span>
	{#if !compact}
		<span aria-hidden="true">通知</span>
	{/if}
</a>

<style lang="scss">
	.bell {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		min-width: 48px;
		min-height: 48px;
		padding: 0 0.75rem;
		border-radius: 0.5rem;
		color: var(--fm-text-muted);
		font-size: 0.875rem;
		text-decoration: none;
	}
	.bell:hover {
		background: var(--fm-surface-muted);
		color: var(--fm-text);
	}
	/* バッジがアイコンの右にはみ出すので、文字との間を広く取る */
	.bell:not(.compact) {
		gap: 1rem;
	}
	.compact {
		justify-content: center;
		width: 48px;
		height: 48px;
		padding: 0;
	}
	.icon-wrap {
		position: relative;
		display: inline-flex;
	}
	.bell :global(.icon) {
		width: 1.5rem;
		height: 1.5rem;
	}
	/* 未読があっても、押せる範囲と位置は変えない (アイコンの上に重ねる) */
	.badge {
		position: absolute;
		top: -0.375rem;
		right: -0.625rem;
		min-width: 1.125rem;
		padding: 0 0.25rem;
		border-radius: 999px;
		background: var(--fm-button);
		color: var(--fm-on-button);
		font-size: 0.6875rem;
		font-weight: 700;
		line-height: 1.125rem;
		text-align: center;
	}
</style>
