<script lang="ts">
	// Funmary のロゴ (吹き出しのない羊と、Funmary の文字)。画面の色 (<html data-theme>) に合わせて、ライトとダークを出し分ける。
	// ダークは、暗い背景に羊の輪郭が沈まないよう、縁取り (アウトライン) のある版を使う。
	// 文字はアウトライン化した図形なので、フォントを読み込まずに描ける。
	// 画像は /brand から読む (セルフホストでは BRAND_DIR で差し替えられる。lib/server/brand-assets.ts)

	/** height は CSS の長さ (例: "1.75rem")。幅は縦横比から決まる */
	let { height }: { height: string } = $props();
</script>

<span class="logo" style:--logo-height={height}>
	<img class="light" src="/brand/logo-light.svg" alt="Funmary" width="1154" height="239" />
	<img class="dark" src="/brand/logo-dark.svg" alt="Funmary" width="1154" height="239" />
</span>

<style lang="scss">
	.logo {
		display: inline-flex;
	}

	img {
		width: auto;
		height: var(--logo-height);
	}

	.dark {
		display: none;
	}

	/* 画面の色の設定がシステムなら端末の設定に従い、ダークならいつでもダークにする (scripts/build-theme.js と同じ条件) */
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .light {
			display: none;
		}
		:global(:root:not([data-theme='light'])) .dark {
			display: block;
		}
	}
	:global(:root[data-theme='dark']) .light {
		display: none;
	}
	:global(:root[data-theme='dark']) .dark {
		display: block;
	}
</style>
