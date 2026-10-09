<script lang="ts">
	// フッターの、ソースコードのリポジトリと、セルフホストの運営者へのリンク (Issue #109)。
	// 「このアプリについて」は、ログインしていなくても開けるので、ここからたどれるようにする (#223)
	import { resolve } from '$app/paths';
	import { REPOSITORY_URL } from '#lib/repository.ts';

	let { operator }: { operator: { name: string; url: string } | null } = $props();
</script>

<p class="footer-links">
	<a href={resolve('about')}>このアプリについて</a>
	<a href={resolve('terms')}>利用規約</a>
	<a href={resolve('privacy')}>プライバシーポリシー</a>
	<!-- eslint-disable svelte/no-navigation-without-resolve -- 外部サイトへのリンク -->
	<a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">ソースコード (GitHub)</a>
	{#if operator}
		<a href={operator.url} target="_blank" rel="noopener noreferrer">運営: {operator.name}</a>
	{/if}
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</p>

<style lang="scss">
	@use 'mixins';

	.footer-links {
		@include mixins.wrap-row(0 1rem);
		margin: 0.5rem 0 0;
		font-size: 0.8125rem;
	}

	a {
		display: inline-flex;
		align-items: center;
		min-height: 32px;
	}
</style>
