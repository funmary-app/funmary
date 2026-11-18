<script lang="ts">
	import Landing from '#lib/components/Landing.svelte';

	let {
		data,
	}: {
		data: {
			signedIn: boolean;
			registration: 'invite' | 'open' | 'closed';
			inviteCode: string | null;
		};
	} = $props();
</script>

<svelte:head>
	<title>Funmary</title>
	<meta
		name="description"
		content="公立はこだて未来大学の学生向けの時間割・休講通知アプリ (非公式)"
	/>
	{#if data.inviteCode}
		<!-- URL に招待コードが入っているので、検索に載せず、外のリンクの参照元にも渡さない -->
		<meta name="robots" content="noindex" />
		<meta name="referrer" content="same-origin" />
	{/if}
</svelte:head>

<Landing registration={data.registration} signedIn={data.signedIn} inviteCode={data.inviteCode} />
