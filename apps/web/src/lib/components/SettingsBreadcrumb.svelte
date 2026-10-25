<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	let {
		current,
		public: isPublic = false,
	}: {
		/** 設定の下の画面の、現在地の名前。設定の画面のカード、見出し、ページのタイトルと同じ名前にする */
		current: string;
		/** ログインしていなくても開ける画面 (#223)。ログインしていなければ、設定の代わりに紹介の画面へ戻す */
		public?: boolean;
	} = $props();

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
	@use 'text';
	@use 'touch';

	.breadcrumb ol {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		@include text.muted;
		padding: 0;
		list-style: none;
	}
	li + li::before {
		content: '>';
		margin: 0 0.5rem;
	}
	a {
		@include touch.target;
		/* 押せる範囲を 44px 以上にする */
	}
</style>
