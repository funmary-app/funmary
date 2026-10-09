<script lang="ts">
	import { resolve } from '$app/paths';
	import type { EventSummary } from '#lib/server/event-summary.ts';

	let { data }: { data: { events: (EventSummary & { subscribed: boolean })[] } } = $props();
</script>

<svelte:head>
	<title>みんなの予定 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<p><a href={resolve('app/events')}>自分の予定</a></p>
	<h1>みんなの予定</h1>
	<p>
		Funmary
		の利用者が、全体に公開した予定です。開いて、自分の時間割に加えられます。公開した人の名前は出ません。
	</p>

	{#if data.events.length === 0}
		<p>公開されている予定は、まだありません。</p>
	{:else}
		<ul class="events">
			{#each data.events as event (event.id)}
				<li>
					<p class="title">
						<a href={resolve('/app/events/shared/[ref]', { ref: String(event.id) })}
							>{event.title}</a
						>
						{#if event.subscribed}<span class="badge">加えています</span>{/if}
					</p>
					<p class="meta">{event.when}、{event.time}</p>
					{#if event.repeat}<p class="meta">繰り返し: {event.repeat}</p>{/if}
					{#if event.location}<p class="meta">場所: {event.location}</p>{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style lang="scss">
	.events {
		padding: 0;
		list-style: none;
	}
	.events > li {
		margin: 0.75rem 0;
		padding: 0.75rem 1rem;
		border: 1px solid var(--fm-divider);
		border-radius: 0.5rem;
	}
	.title {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 500;
	}
	.title a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	.meta {
		margin: 0;
		color: var(--fm-text-muted);
		font-size: 0.875rem;
	}
	.badge {
		margin-left: 0.5rem;
		padding: 0 0.5rem;
		border: 1px solid var(--fm-divider);
		border-radius: 0.375rem;
		font-size: 0.75rem;
		font-weight: 400;
	}
</style>
