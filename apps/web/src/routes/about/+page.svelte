<script lang="ts">
	import { resolve } from '$app/paths';
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';
	import { OFFICIAL_ACCOUNTS } from '#lib/official-accounts.ts';
	import { REPOSITORY_URL } from '#lib/repository.ts';

	let {
		data,
	}: {
		data: {
			operator: { name: string; url: string } | null;
			contactEmail: string | null;
			supportInvite: { url: string } | null;
		};
	} = $props();
</script>

<svelte:head>
	<title>リポジトリと作者 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<SettingsBreadcrumb current="リポジトリと作者" public />
	<h1>リポジトリと作者</h1>
	<p class="muted">
		Funmary は、公立はこだて未来大学の学生向けの、大学とは関係のない非公式のアプリです。
	</p>

	<ul class="links">
		<li>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- 外部サイトへのリンク -->
			<a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">ソースコード (GitHub)</a>
		</li>
		<li>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- 外部サイトへのリンク -->
			<a href="{REPOSITORY_URL}/issues" target="_blank" rel="noopener noreferrer">
				不具合の報告、要望 (GitHub Issues)
			</a>
		</li>

		{#each OFFICIAL_ACCOUNTS as account (account.url)}
			<li>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- 外部サイトへのリンク -->
				<a href={account.url} target="_blank" rel="noopener noreferrer">
					公式アカウント: {account.label}
				</a>
			</li>
		{/each}
		<li><a href={resolve('contributors')}>コードを書いてくれた人たち</a></li>
		<li><a href={resolve('license')}>ライセンス</a></li>
		<li><a href={resolve('third-party-licenses')}>サードパーティライセンス</a></li>
		<li><a href={resolve('terms')}>利用規約</a></li>
		<li><a href={resolve('privacy')}>プライバシーポリシー</a></li>

		{#if data.operator}
			<li>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- 外部サイトへのリンク -->
				<a href={data.operator.url} target="_blank" rel="noopener noreferrer">
					運営: {data.operator.name}
				</a>
			</li>
		{/if}
		{#if data.supportInvite}
			<li>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Discord の招待 (外部のサイト) -->
				<a href={data.supportInvite.url} target="_blank" rel="noopener noreferrer">
					Discord のサポートサーバー
				</a>
			</li>
		{/if}
		{#if data.contactEmail}
			<li>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- メールの作成画面を開く -->
				<a href="mailto:{data.contactEmail}">問い合わせ: {data.contactEmail}</a>
			</li>
		{/if}
	</ul>

	<h2>クレジット</h2>
	<p>
		ロゴの文字には、フォント「07あかずきんポップ」を使っています。
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- 外部サイトへのリンク -->
		<a href="https://flopdesign.booth.pm/items/1748058" target="_blank" rel="noopener noreferrer"
			>フリーダウンロード (BOOTH)</a
		>
	</p>
</div>

<style lang="scss">
	.links {
		margin: 1rem 0 0;
		padding: 0;
		list-style: none;

		a {
			display: inline-flex;
			align-items: center;
			min-height: 44px;
		}
	}
</style>
