<script lang="ts">
	import IconHidden from '~icons/material-symbols/visibility-off-outline';
	import IconShown from '~icons/material-symbols/visibility-outline';

	// メールアドレスの @ より前 (学籍番号などが入る部分) を隠し、押したときだけ出す。
	// 隠している間は、その部分を画面の要素に入れない。長さも分からないよう、点の数は固定にする
	let { email }: { email: string } = $props();

	const at = $derived(email.lastIndexOf('@'));
	const name = $derived(at > 0 ? email.slice(0, at) : email);
	const domain = $derived(at > 0 ? email.slice(at) : '');
	let revealed = $state(false);
</script>

<span class="masked-email">
	<!-- ボタンはアドレスの前に置く。表示してアドレスが伸びても、ボタンの位置が変わらないようにする -->
	<button
		type="button"
		aria-pressed={revealed}
		aria-label={revealed ? 'メールアドレスを隠す' : 'メールアドレスを表示する'}
		onclick={() => (revealed = !revealed)}
	>
		{#if revealed}<IconHidden aria-hidden="true" />{:else}<IconShown aria-hidden="true" />{/if}
	</button>
	<span class="address"
		>{#if revealed}{name}{:else}<span aria-hidden="true">••••••••</span
			>{/if}{domain}{#if !revealed}<span class="visually-hidden">
				(名前の部分は隠しています)</span
			>{/if}</span
	>
</span>

<style lang="scss">
	.masked-email {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 0.25rem;
		min-width: 0;
	}
	/* 伏せても表示しても、欄の幅は変えない (長いときは末尾を省く) */
	.address {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	button {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		border: 0;
		border-radius: 0.5rem;
		background: none;
		color: var(--fm-text-muted);
		cursor: pointer;
	}
	button:hover {
		background: var(--fm-surface-muted);
		color: var(--fm-text);
	}
	button :global(svg) {
		width: 1.25rem;
		height: 1.25rem;
	}
</style>
