<script lang="ts">
	import { onMount } from 'svelte';
	import { isStandalone } from '#lib/standalone.ts';

	/** 折りたたんでいるかどうかを覚える先 (このブラウザだけ) */
	const STORAGE_KEY = 'funmary:install-guide-open';

	// ホーム画面に追加したアプリとして開いているときは、案内を出さない。
	// ブラウザの多くは CSS の display-mode で隠せる (ちらつかない)。iOS の古い判定 (navigator.standalone) だけ、JS で補う
	let installed = $state(false);
	// 既定は開いた状態。前回閉じていれば、それを覚えて次からも閉じたまま出す
	let open = $state(true);
	let restored = $state(false);

	onMount(() => {
		installed = isStandalone();
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved !== null) open = saved === '1';
		} catch {
			// プライベートブラウズなどで読めなくても、開いたままにするだけ
		}
		restored = true;
	});

	$effect(() => {
		if (!restored) return;
		try {
			localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
		} catch {
			// 保存できなくても、この画面を開いている間だけ覚えていればよい
		}
	});
</script>

{#if !installed}
	<section id="install" class="install-guide" aria-labelledby="install-heading">
		<details bind:open>
			<summary><h2 id="install-heading">アプリとして使う</h2></summary>
			<p>
				Funmary
				は、ホーム画面に追加すると、ブラウザのバーのないアプリのように、すぐ開いて使えます。アプリストアからの入手は要りません。
			</p>
			<dl>
				<dt>iPhone、iPad (Safari)</dt>
				<dd>画面下 (iPad は上) の共有ボタンを押し、「ホーム画面に追加」を選びます。</dd>
				<dt>Android (Chrome)</dt>
				<dd>右上のメニューを開き、「アプリをインストール」か「ホーム画面に追加」を選びます。</dd>
				<dt>パソコン (Chrome、Edge)</dt>
				<dd>アドレスバーの右にあるインストールのボタンを押します。</dd>
			</dl>
			<p class="muted">
				プッシュ通知は、今後対応する予定です。iPhone
				では、ホーム画面に追加したアプリでしかプッシュ通知を受け取れないので、いまのうちに追加しておくと、対応したときにすぐ使えます。追加したアプリで開くと、この案内は出なくなります。
			</p>
		</details>
	</section>
{/if}

<style lang="scss">
	summary {
		min-height: 44px;
		align-content: center;
		cursor: pointer;
	}
	summary h2 {
		display: inline;
		font-size: 1rem;
	}
	dt {
		margin-top: 0.75rem;
		font-weight: 700;
	}
	dd {
		margin: 0.25rem 0 0;
	}
	@media (display-mode: standalone) {
		.install-guide {
			display: none;
		}
	}
</style>
