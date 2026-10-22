<script lang="ts">
	// 利用規約とプライバシーポリシーの「連絡先」。どちらも同じ窓口を書く
	let {
		contactEmail,
		operator,
	}: {
		contactEmail: string | null;
		operator: { name: string; url: string } | null;
	} = $props();
</script>

<ul class="links">
	{#if contactEmail}
		<li>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- メールの作成画面を開く -->
			<a href="mailto:{contactEmail}">{contactEmail}</a>
		</li>
	{/if}
	{#if operator}
		<!-- eslint-disable svelte/no-navigation-without-resolve -- 外部サイトへのリンク -->
		<li>
			運営: <a href={operator.url} target="_blank" rel="noopener noreferrer">{operator.name}</a>
		</li>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{/if}
</ul>

<style lang="scss">
	@use 'touch';

	.links {
		margin: 0;
		padding: 0;
		list-style: none;

		a {
			@include touch.target;
		}
	}
</style>
