<script lang="ts">
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';

	let { data }: { data: { thirdPartyLicenses: string | null } } = $props();
</script>

<svelte:head>
	<title>サードパーティライセンス - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<SettingsBreadcrumb current="サードパーティライセンス" public />
	<h1>サードパーティライセンス</h1>
	<p class="muted">Funmary が使っている、オープンソースのソフトウェアの一覧です。</p>

	{#if data.thirdPartyLicenses}
		<pre>{data.thirdPartyLicenses}</pre>
	{:else}
		<p class="muted">
			手元の開発では表示できません。<code>pnpm build</code> を実行すると見られます。
		</p>
	{/if}
</div>

<style lang="scss">
	pre {
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		border-radius: 0.75rem;
		background: var(--fm-surface-muted);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: 0.8125rem;
	}
</style>
