<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	let {
		current,
		public: isPublic = false,

		/** 設定の下の画面の、現在地の名前 (画面の見出しと同じにする) */
		/** ログインしていなくても開ける画面 (#223)。ログインしていなければ、設定の代わりに紹介の画面へ戻す */
	}: { current: string; public?: boolean } = $props();

	const toTop = $derived(isPublic && page.data['user'] == null);
</script>

<nav aria-label="パンくず" class="breadcrumb">
	<ol>
		<li>
			{#if toTop}
				<a href={resolve('/')}>トップ</a>
			{:else}
				<a href={resolve('app/settings')}>設定</a>
			{/if}
		</li>
		<li aria-current="page">{current}</li>
	</ol>
</nav>

<style lang="scss">
	.breadcrumb ol {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--fm-text-muted);
		font-size: 0.875rem;
	}
	li + li::before {
		content: '>';
		margin: 0 0.5rem;
	}
	a {
		display: inline-flex;
		align-items: center;
		/* 押せる範囲を 44px 以上にする */
		min-height: 44px;
	}
</style>
