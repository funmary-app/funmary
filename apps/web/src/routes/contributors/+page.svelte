<script lang="ts">
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';
	import { REPOSITORY_URL } from '#lib/repository.ts';

	let {
		data,
	}: {
		data: {
			contributors: { login: string; url: string; avatarUrl: string; contributions: number }[];
			error: string | null;
		};
	} = $props();
</script>

<svelte:head>
	<title>Contributors - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<SettingsBreadcrumb current="Contributors" public />
	<h1>Contributors</h1>
	<p class="muted">
		Funmary のコードを書いてくれた人たちです。GitHub
		から取得しているので、少し前の状態のことがあります。
	</p>

	{#if data.error}
		<p class="muted">{data.error}</p>
	{:else if data.contributors.length === 0}
		<p class="muted">まだ誰もいません。</p>
	{:else}
		<ul class="contributors">
			{#each data.contributors as contributor (contributor.login)}
				<li>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- 外部サイトへのリンク -->
					<a href={contributor.url} target="_blank" rel="noopener noreferrer">
						<img src={contributor.avatarUrl} alt="" width="48" height="48" loading="lazy" />
						<span class="login">{contributor.login}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	<p class="muted">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- 外部サイトへのリンク -->
		<a href="{REPOSITORY_URL}/graphs/contributors" target="_blank" rel="noopener noreferrer">
			GitHub の貢献の詳細
		</a>
	</p>
</div>

<style lang="scss">
	.contributors {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
		gap: 0.5rem;
		margin: 1rem 0 0;
		padding: 0;
		list-style: none;

		a {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 0.375rem;
			min-height: 44px;
			padding: 0.5rem;
			border-radius: 0.75rem;
			color: inherit;
			text-align: center;
			text-decoration: none;
		}

		a:hover {
			background: var(--fm-surface-muted);
		}

		img {
			border-radius: 50%;
		}

		.login {
			overflow: hidden;
			width: 100%;
			font-size: 0.8125rem;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}
</style>
