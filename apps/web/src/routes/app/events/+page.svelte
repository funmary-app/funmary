<script lang="ts">
	import Button, { Label } from '@smui/button';
	import { resolve } from '$app/paths';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import type { EventSummary } from '#lib/server/event-summary.ts';

	let {
		data,
	}: {
		data: {
			message: string | null;
			events: (EventSummary & { visibility: string })[];
			subscribed: EventSummary[];
		};
	} = $props();
</script>

<svelte:head>
	<title>自分の予定 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<p><a href={resolve('app/week')}>時間割</a></p>
	<h1>自分の予定</h1>
	<p>
		サークル、課外活動、合宿など、授業のほかの予定を足します。足した予定は、今日と週の画面に出ます。初めは、あなただけに見えます。公開すると、ほかの人が自分の時間割に加えられます。
	</p>

	<FormNotice message={data.message} />

	<div class="actions">
		<Button href={resolve('app/events/new')} variant="unelevated"><Label>予定を足す</Label></Button>

		<Button href={resolve('app/events/browse')} variant="outlined"
			><Label>みんなの予定を探す</Label></Button
		>
	</div>

	<section aria-labelledby="mine-heading">
		<h2 id="mine-heading">足した予定</h2>
		{#if data.events.length === 0}
			<p>まだ予定がありません。</p>
		{:else}
			<ul class="events">
				{#each data.events as event (event.id)}
					<li>
						<p class="title">{event.title}</p>
						<p class="meta">{event.when}、{event.time}</p>
						{#if event.repeat}<p class="meta">繰り返し: {event.repeat}</p>{/if}
						{#if event.location}<p class="meta">場所: {event.location}</p>{/if}
						<p class="meta">公開範囲: {event.visibility}</p>
						<a class="edit" href={resolve('/app/events/[id]', { id: String(event.id) })}>
							編集<span class="visually-hidden">: {event.title}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if data.subscribed.length > 0}
		<section aria-labelledby="added-heading">
			<h2 id="added-heading">加えた予定</h2>
			<p>ほかの人の予定のうち、自分の時間割に加えたものです。持ち主が直すと、反映されます。</p>
			<ul class="events">
				{#each data.subscribed as event (event.id)}
					<li>
						<p class="title">{event.title}</p>
						<p class="meta">{event.when}、{event.time}</p>
						{#if event.repeat}<p class="meta">繰り返し: {event.repeat}</p>{/if}
						{#if event.location}<p class="meta">場所: {event.location}</p>{/if}
						<a class="edit" href={resolve('/app/events/shared/[ref]', { ref: String(event.id) })}>
							開く<span class="visually-hidden">: {event.title}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style lang="scss">
	@use 'mixins';

	.actions {
		@include mixins.wrap-row(0.5rem);
	}
	section {
		margin-top: 1.5rem;
	}
	h2 {
		font-size: 1.1rem;
	}
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
	.meta {
		margin: 0;
		color: var(--fm-text-muted);
		font-size: 0.875rem;
	}
	.edit {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
