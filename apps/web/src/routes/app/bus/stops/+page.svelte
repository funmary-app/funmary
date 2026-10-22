<script lang="ts">
	import { resolve } from '$app/paths';
	import IconBack from '~icons/material-symbols/arrow-back';
	import IconCheck from '~icons/material-symbols/check';
	import FormNotice from '#lib/components/FormNotice.svelte';

	let {
		data,
		form,
	}: {
		data: {
			stops: { id: string; name: string }[];
			selectedStopId: string | null;
		};
		form: { error?: string } | null;
	} = $props();
</script>

<svelte:head>
	<title>バス停の選択 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page page-w-48">
	<a class="back" href={resolve('app/bus')}><IconBack aria-hidden="true" />バスに戻る</a>
	<h1>バス停選択</h1>
	<p class="muted">
		未来大との間を行き来する、乗り降りするバス停を選んでください。選んだバス停は、次に開いたときも使います。
	</p>
	<FormNotice error={form?.error} />
	<ul class="stops">
		{#each data.stops as stop (stop.id)}
			<li>
				<form method="POST" action="?/select">
					<input type="hidden" name="stopId" value={stop.id} />
					<button type="submit" aria-current={stop.id === data.selectedStopId ? 'true' : undefined}>
						<span>{stop.name}</span>
						{#if stop.id === data.selectedStopId}<IconCheck aria-hidden="true" />{/if}
					</button>
				</form>
			</li>
		{/each}
	</ul>
</div>

<style lang="scss">
	@use 'touch';

	.back {
		@include touch.target;
		gap: 0.25rem;
		color: var(--fm-text-muted);
		text-decoration: none;
	}

	.stops {
		margin: 1rem 0 0;
		padding: 0;
		list-style: none;

		button {
			display: flex;
			align-items: center;
			justify-content: space-between;
			width: 100%;
			min-height: 52px;
			padding: 0 0.5rem;
			border: 0;
			border-bottom: 1px dashed var(--fm-divider);
			background: none;
			color: var(--fm-text);
			font: inherit;
			text-align: left;
			cursor: pointer;
		}

		button:hover {
			background: var(--fm-surface-muted);
		}

		button[aria-current='true'] {
			color: var(--fm-primary);
			font-weight: 700;
		}
	}
</style>
