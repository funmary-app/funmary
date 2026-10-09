<script lang="ts">
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import FormNotice from '#lib/components/FormNotice.svelte';

	type Kind = 'cancellation' | 'makeup' | 'roomChange' | 'integration' | 'notice';

	interface NotificationRow {
		id: number;
		kind: Kind;
		title: string;
		body: string | null;
		hasLink: boolean;
		createdAt: string;
		read: boolean;
	}

	let {
		data,
		form,
	}: {
		data: { kind: Kind | null; notifications: NotificationRow[] };
		form: { error?: string; message?: string } | null;
	} = $props();

	const FILTERS: { kind: Kind | null; label: string }[] = [
		{ kind: null, label: 'すべて' },
		{ kind: 'cancellation', label: '休講' },
		{ kind: 'makeup', label: '補講' },
		{ kind: 'roomChange', label: '教室変更' },
		{ kind: 'integration', label: '連携の不具合' },
		{ kind: 'notice', label: 'お知らせ' },
	];

	const unread = $derived(data.notifications.filter((item) => !item.read).length);
</script>

<svelte:head>
	<title>通知 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page page-w-48">
	<h1>通知</h1>
	<p class="muted">
		履修している科目の休講、補講、教室変更などが届きます。90 日より古い通知は、自動で消えます。
	</p>

	<FormNotice error={form?.error} message={form?.message} />

	<!-- eslint-disable svelte/no-navigation-without-resolve -- resolve した /app/notifications に、種類を足している -->
	<nav aria-label="種類で絞り込む">
		<ul class="filters">
			{#each FILTERS as filter (filter.label)}
				<li>
					<a
						href={filter.kind
							? `${resolve('app/notifications')}?kind=${filter.kind}`
							: resolve('app/notifications')}
						aria-current={data.kind === filter.kind ? 'page' : undefined}>{filter.label}</a
					>
				</li>
			{/each}
		</ul>
	</nav>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->

	<div class="toolbar">
		<form method="POST" action="?/readAll" use:enhance>
			<Button type="submit" variant="outlined" disabled={unread === 0}>
				<Label>すべて既読にする</Label>
			</Button>
		</form>
	</div>

	{#if data.notifications.length === 0}
		<p>通知はまだありません。</p>
	{:else}
		<ul class="list">
			{#each data.notifications as item (item.id)}
				<li class={{ unread: !item.read }}>
					<form method="POST" action="?/open" use:enhance>
						<input type="hidden" name="id" value={item.id} />
						<button type="submit" class="item">
							<span class="title">
								{#if !item.read}<span class="dot" aria-hidden="true"></span><span
										class="visually-hidden"
										>未読:
									</span>{/if}{item.title}
							</span>
							{#if item.body}<span class="body">{item.body}</span>{/if}
							<span class="time">{item.createdAt}{item.hasLink ? '' : ' (開く画面なし)'}</span>
						</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style lang="scss">
	@use 'mixins';

	.filters {
		@include mixins.wrap-row(0.5rem);
		margin: 1rem 0;
		padding: 0;
		list-style: none;

		a {
			display: inline-flex;
			align-items: center;
			min-height: 40px;
			padding: 0 0.875rem;
			border: 1px solid var(--fm-divider);
			border-radius: 999px;
			color: var(--fm-text);
			font-size: 0.875rem;
			text-decoration: none;
		}

		a[aria-current='page'] {
			border-color: var(--fm-primary);
			background: var(--fm-primary-soft);
			color: var(--fm-primary);
			font-weight: 700;
		}
	}

	.toolbar {
		margin-bottom: 0.5rem;
	}

	.list {
		margin: 0;
		padding: 0;
		list-style: none;

		li {
			border-bottom: 1px dashed var(--fm-divider);
		}
	}

	.item {
		@include mixins.stack(0.125rem);
		width: 100%;
		min-height: 48px;
		padding: 0.75rem 0.5rem;
		border: 0;
		border-radius: 0.5rem;
		background: none;
		color: var(--fm-text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.item:hover {
		background: var(--fm-surface-muted);
	}

	.title {
		overflow-wrap: anywhere;
	}

	.unread .title {
		font-weight: 700;
	}

	.dot {
		display: inline-block;
		width: 0.5rem;
		height: 0.5rem;
		margin-right: 0.5rem;
		border-radius: 50%;
		background: var(--fm-cancelled);
		vertical-align: middle;
	}

	.body,
	.time {
		color: var(--fm-text-muted);
		font-size: 0.875rem;
		overflow-wrap: anywhere;
	}
</style>
