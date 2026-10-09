<script lang="ts">
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';

	let { data }: { data: { licenses: { file: string; text: string }[] | null } } = $props();

	const NAMES: Record<string, string> = {
		'LICENSE-BSD-3-CLAUSE': 'BSD-3-Clause',
		'LICENSE-APACHE-2.0': 'Apache-2.0',
		'LICENSE-ASSETS': 'ロゴとアイコンの利用条件',
	};
</script>

<svelte:head>
	<title>ライセンス - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<SettingsBreadcrumb current="ライセンス" public />
	<h1>ライセンス</h1>
	<p class="muted">
		Funmary のコードは、BSD-3-Clause と Apache-2.0
		のデュアルライセンスです。利用者は、どちらか一方を選べます。ロゴとアイコンは対象外で、別の利用条件があります。
	</p>

	{#if data.licenses}
		{#each data.licenses as license (license.file)}
			<details>
				<summary>{NAMES[license.file] ?? license.file}</summary>
				<pre>{license.text}</pre>
			</details>
		{/each}
	{:else}
		<p class="muted">
			手元の開発では表示できません。<code>pnpm build</code> を実行すると見られます。
		</p>
	{/if}
</div>

<style lang="scss">
	details {
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		border-radius: 0.75rem;
		background: var(--fm-surface-muted);
	}

	summary {
		font-weight: 700;
		cursor: pointer;
	}

	pre {
		margin: 0.75rem 0 0;
		white-space: pre-wrap;
		font-size: 0.8125rem;
	}
</style>
