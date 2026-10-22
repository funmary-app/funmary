<script lang="ts">
	// 操作がうまくいったことの短い知らせ (notify で出す)。最上位のレイアウトに 1 つだけ置く。
	// 読み終わる前に消えないよう、Material Design で決められた長さの上限 (10 秒) まで出す
	import Snackbar, { Label } from '@smui/snackbar';
	import { notice } from '#lib/notify.svelte.ts';

	// 使うのは出し直すメソッドだけ (lint の型の解析は、Svelte の部品のメソッドの型を読めないため、ここで書く)
	let snackbar: { forceOpen(): void } | undefined = $state();

	$effect(() => {
		if (notice.current === null || !snackbar) return;
		// 出したままで次の知らせが来ても、文言を替えて出し直す
		snackbar.forceOpen();
	});
</script>

<Snackbar bind:this={snackbar} timeoutMs={10000}>
	<Label>{notice.current?.message ?? ''}</Label>
</Snackbar>
