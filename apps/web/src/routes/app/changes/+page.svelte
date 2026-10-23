<script lang="ts">
	import { resolve } from '$app/paths';
	import PortalFreshness from '#lib/components/PortalFreshness.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import type { SubjectPathParams } from '#lib/subject-path.ts';
	import { formatDate } from '#lib/timetable-label.ts';

	type Scope = 'mine' | 'all';
	type When = 'upcoming' | 'past';

	let {
		data,
	}: {
		data: {
			scope: Scope;
			when: When;
			today: string;
			days: {
				date: string;
				changes: {
					key: string;
					period: number;
					name: string;
					/** 詳細を開けない科目なら null */
					path: SubjectPathParams | null;
					status: 'cancelled' | 'makeup' | 'roomChanged';
					label: string;
					detail: string | null;
					comment: string | null;
				}[];
			}[];
			fetchedAt: { date: string; time: string } | null;
			stale: boolean;
		};
	} = $props();

	const SCOPES: { value: Scope; label: string }[] = [
		{ value: 'mine', label: '自分の履修科目' },
		{ value: 'all', label: '全体' },
	];
	const WHENS: { value: When; label: string }[] = [
		{ value: 'upcoming', label: 'これから' },
		{ value: 'past', label: '過ぎた分' },
	];

	/** 切り替えの先の URL。既定 (自分の履修科目、これから) の値は付けない */
	function listUrl(scope: Scope, when: When) {
		const query = [scope === 'all' && 'scope=all', when === 'past' && 'when=past']
			.filter(Boolean)
			.join('&');
		return query === '' ? resolve('app/changes') : resolve(`app/changes?${query}`);
	}
</script>

<svelte:head>
	<title>休講、補講、教室変更 - Funmary</title>
</svelte:head>

<div class="page">
	<h1>休講、補講、教室変更</h1>

	<div class="toolbar">
		<nav aria-label="出す科目">
			{#each SCOPES as option (option.value)}
				{#if option.value === data.scope}
					<span class="text-button current" aria-current="true">{option.label}</span>
				{:else}
					<a class="text-button" href={listUrl(option.value, data.when)}>{option.label}</a>
				{/if}
			{/each}
		</nav>
		<nav aria-label="出す期間">
			{#each WHENS as option (option.value)}
				{#if option.value === data.when}
					<span class="text-button current" aria-current="true">{option.label}</span>
				{:else}
					<a class="text-button" href={listUrl(data.scope, option.value)}>{option.label}</a>
				{/if}
			{/each}
		</nav>
	</div>

	<PortalFreshness fetchedAt={data.fetchedAt} stale={data.stale} today={data.today} />

	{#if data.days.length === 0}
		<p>
			{data.when === 'upcoming' ? 'これからの' : '過ぎた'}{data.scope === 'mine'
				? '履修科目の'
				: ''}休講、補講、教室変更はありません。
		</p>
	{/if}

	{#each data.days as day (day.date)}
		<section aria-labelledby="day-{day.date}">
			<h2 id="day-{day.date}">{formatDate(day.date)}</h2>
			<ul class="changes">
				{#each day.changes as change (change.key)}
					<li>
						<span class="period">{change.period} 限</span>
						<StatusBadge status={change.status} />
						{#if change.path}
							<a href={resolve('/app/subjects/[year]/[code]', change.path)}>{change.name}</a>
						{:else}
							{change.name}
						{/if}
						{#if change.detail}<span class="detail">{change.detail}</span>{/if}
						{#if change.comment}<p class="comment">{change.comment}</p>{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>

<style lang="scss">
	@use 'mixins';
	@use 'surfaces';
	@use 'toolbar-button';

	.toolbar {
		@include mixins.wrap-row(0.5rem 1rem);
	}
	nav {
		@include mixins.wrap-row(0.25rem);
	}
	.text-button {
		@include toolbar-button.base;
		padding: 0 1rem;
	}
	.text-button.current {
		border-color: var(--fm-primary);
		background: var(--fm-primary-soft);
		color: var(--fm-primary);
		cursor: default;
		&:hover {
			background: var(--fm-primary-soft);
		}
	}
	h2 {
		margin: 1.5rem 0 0.5rem;
		font-size: 1.05rem;
	}
	.changes {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.changes > li {
		@include surfaces.outlined;
	}
	.changes > li + li {
		margin-top: 0.5rem;
	}
	.period {
		margin-right: 0.5rem;
		font-weight: 700;
	}
	.detail {
		margin-left: 0.5rem;
		color: var(--fm-text-muted);
	}
	.comment {
		margin: 0.25rem 0 0;
		color: var(--fm-text-muted);
		font-size: 0.875rem;
	}
</style>
