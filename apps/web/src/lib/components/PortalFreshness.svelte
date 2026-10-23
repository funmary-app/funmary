<script lang="ts">
	// 休講情報 (学生ポータル) を最後に取った時刻。12 時間以上取れていなければ、載っていない休講がありうると知らせる
	import IconWarning from '~icons/material-symbols/warning-outline';
	import { formatFetchedAt } from '#lib/timetable-label.ts';

	let {
		fetchedAt,
		stale,
		today,
	}: { fetchedAt: { date: string; time: string } | null; stale: boolean; today: string } = $props();
</script>

{#if stale}
	<p class="stale" role="alert">
		<IconWarning aria-hidden="true" class="icon" />
		<span>
			{#if fetchedAt}
				休講情報の最終取得: {formatFetchedAt(fetchedAt, today)}。12
				時間以上更新されていません。休講などが載っていない可能性があります。
			{:else}
				休講情報をまだ取得していません。休講などは載っていません。
			{/if}
		</span>
	</p>
{:else if fetchedAt}
	<p class="freshness">休講情報の最終取得: {formatFetchedAt(fetchedAt, today)}</p>
{/if}

<style lang="scss">
	.freshness {
		margin: 1.5rem 0 0;
		color: var(--fm-text-muted);
		font-size: 0.875rem;
	}

	.stale {
		display: flex;
		gap: 0.5rem;
		margin: 1.5rem 0 0;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		background: var(--fm-room-changed-soft);
		color: var(--fm-text);
		font-size: 0.875rem;

		:global(.icon) {
			color: var(--fm-room-changed);
		}
	}
</style>
