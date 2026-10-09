<script lang="ts">
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import type { EventSummary } from '#lib/server/event-summary.ts';

	let {
		data,
		form,
	}: {
		data: {
			event: EventSummary;
			isOwner: boolean;
			subscribed: boolean;
		};
		form: { error?: string; message?: string } | null;
	} = $props();
</script>

<svelte:head>
	<title>{data.event.title} - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page page-w-40">
	<p><a href={resolve('app/events')}>自分の予定</a></p>
	<h1>{data.event.title}</h1>

	<FormNotice error={form?.error} message={form?.message} />

	<dl>
		<dt>日付</dt>
		<dd>{data.event.when}</dd>
		<dt>時間</dt>
		<dd>{data.event.time}</dd>
		{#if data.event.repeat}
			<dt>繰り返し</dt>
			<dd>{data.event.repeat}</dd>
		{/if}
		{#if data.event.location}
			<dt>場所</dt>
			<dd>{data.event.location}</dd>
		{/if}
		{#if data.event.notes}
			<dt>メモ</dt>
			<dd class="notes">{data.event.notes}</dd>
		{/if}
	</dl>

	{#if data.isOwner}
		<p>あなたの予定です。</p>
		<Button href={resolve('/app/events/[id]', { id: String(data.event.id) })} variant="outlined">
			<Label>予定を直す</Label>
		</Button>
	{:else if data.subscribed}
		<p>自分の時間割に加えています。持ち主が直すと、ここにも反映されます。</p>
		<form method="POST" action="?/unsubscribe" use:enhance>
			<Button type="submit" variant="outlined"><Label>自分の時間割から外す</Label></Button>
		</form>
	{:else}
		<form method="POST" action="?/subscribe" use:enhance>
			<Button type="submit" variant="unelevated"><Label>自分の時間割に加える</Label></Button>
		</form>
	{/if}
</div>

<style lang="scss">
	dt {
		margin-top: 0.75rem;
		color: var(--fm-text-muted);
		font-size: 0.875rem;
	}
	dd {
		margin: 0.125rem 0 0;
	}
	.notes {
		white-space: pre-wrap;
	}
</style>
