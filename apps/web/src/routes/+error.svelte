<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	/** SvelteKit が既定で入れる英語のメッセージ。利用者には出さず、見出しだけで伝える */
	const DEFAULT_MESSAGES = new Set(['Not Found', 'Internal Error', 'Forbidden']);

	const status = $derived(page.status);
	const title = $derived.by(() => {
		if (status === 404) return 'ページが見つかりません';
		if (status === 403) return 'このページは表示できません';
		if (status >= 500) return 'サーバーでエラーが起きました';
		return 'エラーが起きました';
	});
	const message = $derived(
		page.error && !DEFAULT_MESSAGES.has(page.error.message) ? page.error.message : null,
	);
	/** 画像を読めなかったら、枠ごと出さない (画面を崩さない) */
	let imageFailed = $state(false);
</script>

<svelte:head>
	<title>{status} {title} - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="error">
	<p class="status">{status}</p>
	<h1>{title}</h1>
	{#if message}<p>{message}</p>{/if}
	{#if status >= 500}
		<p>時間をおいて、もう一度お試しください。</p>
	{/if}
	<p><a href={resolve('/')}>トップページへ戻る</a></p>

	{#if !imageFailed}
		<!-- ネタとして、状態の番号の猫を出す。画像は配らず http.cat から読み、どの画面から来たかは送らない -->
		<figure>
			<img
				src="https://http.cat/{status}.jpg"
				alt="HTTP {status} を表す猫の写真"
				width="750"
				height="600"
				referrerpolicy="no-referrer"
				onerror={() => (imageFailed = true)}
			/>
			<figcaption>
				猫の写真:
				<a href="https://http.cat/" target="_blank" rel="noopener noreferrer">http.cat</a>
			</figcaption>
		</figure>
	{/if}
</div>

<style lang="scss">
	.error {
		max-width: 40rem;
		margin: 2rem auto;
	}

	.status {
		margin: 0;
		color: var(--fm-text-muted);
		font-size: 2.5rem;
		font-weight: 700;
		line-height: 1;
	}

	h1 {
		margin: 0.5rem 0 1rem;
		font-size: 1.5rem;
	}

	figure {
		margin: 2rem 0 0;
	}

	img {
		display: block;
		max-width: 100%;
		height: auto;
		border-radius: 0.5rem;
		background: var(--fm-surface-muted);
	}

	figcaption {
		margin-top: 0.5rem;
		color: var(--fm-text-muted);
		font-size: 0.8125rem;
	}
</style>
