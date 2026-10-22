<script lang="ts">
	// フォームの操作の結果を出す。失敗の理由は、見落とさないよう画面の中の帯に出す。
	// うまくいった知らせは、画面の下に短く出す (NotifySnackbar)。両方渡したときは、失敗を優先する
	import { page } from '$app/state';
	import { notify } from '#lib/notify.svelte.ts';

	let { error = null, message = null }: { error?: string | null; message?: string | null } =
		$props();

	$effect(() => {
		// 同じ文言の操作を続けたときも出し直すよう、フォームの結果が変わるたびに出す
		void page.form;
		if (!error && message) notify(message);
	});
</script>

{#if error}
	<p class="notice error" role="alert">{error}</p>
{/if}

<style lang="scss">
	.notice {
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		background: var(--fm-surface-muted);
		overflow-wrap: anywhere;

		&.error {
			color: var(--fm-error);
		}
	}
</style>
