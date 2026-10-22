<script lang="ts">
	// 文字は端末によらず LINE Seed JP にし、LINE Seed JP にない字は Noto Sans JP で補う。
	// 使う太さは本文 (400) と太字 (700) だけ。文字の範囲ごとにファイルが分かれていて、
	// ブラウザは画面にある字の分だけを読む (Noto Sans JP は、LINE Seed JP にない字が出たときだけ読まれる)
	import '@fontsource/line-seed-jp/400.css';
	import '@fontsource/line-seed-jp/700.css';
	import '@fontsource/noto-sans-jp/400.css';
	import '@fontsource/noto-sans-jp/700.css';
	import '#lib/styles/generated/smui.css';
	import '#lib/styles/base.scss';
	import '#lib/styles/smui-overrides.scss';
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AboutApp, { type About } from '#lib/components/AboutApp.svelte';
	import BrandLogo from '#lib/components/BrandLogo.svelte';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import FooterLinks from '#lib/components/FooterLinks.svelte';
	import NotifySnackbar from '#lib/components/NotifySnackbar.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import type { ThemePreference } from '#lib/theme.ts';

	let {
		data,
		children,
	}: {
		data: {
			theme: ThemePreference;
			about: About;
			operator: { name: string; url: string } | null;
		};
		children: Snippet;
	} = $props();

	// アプリ (/app の下) は、メニューのある枠を app/+layout.svelte で付ける。
	// ここでは、紹介、ログイン、エラーの画面に、名前と画面の色のボタンだけの簡素な枠を付ける
	const inApp = $derived(page.url.pathname === '/app' || page.url.pathname.startsWith('/app/'));

	// URL を SNS や Discord で共有したときのカード (OGP)。画像の URL は、絶対 URL でないと読まれない
	const OG_DESCRIPTION = '公立はこだて未来大学の学生向けの便利な総合 Web アプリ (非公式)';
</script>

<svelte:head>
	<meta property="og:site_name" content="Funmary" />
	<meta property="og:type" content="website" />
	<meta property="og:locale" content="ja_JP" />
	<meta property="og:title" content="Funmary" />
	<meta property="og:description" content={OG_DESCRIPTION} />
	<meta property="og:url" content={`${page.url.origin}${page.url.pathname}`} />
	<meta property="og:image" content={`${page.url.origin}/brand/og-image.png`} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="Funmary のロゴ" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

{#if inApp}
	{@render children()}
{:else}
	<header class="guest-top">
		<a class="brand" href={resolve('/')}><BrandLogo height="1.75rem" /></a>
		<ThemeToggle initial={data.theme} compact />
	</header>
	<main class="solo">
		{@render children()}
		<footer>
			<p class="unofficial">Funmary は公立はこだて未来大学の公式のアプリではありません。</p>
			<FooterLinks operator={data.operator} />
			<AboutApp about={data.about} />
		</footer>
	</main>
{/if}

<!-- どの画面からも使う、確認のダイアログと、うまくいったことの知らせ -->
<ConfirmDialog />
<NotifySnackbar />

<style lang="scss">
	@use 'breakpoints';
	@use 'chrome';
	@use 'text';

	.guest-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		max-width: 64rem;
		margin: 0 auto;
		padding: 0.25rem 0.5rem 0.25rem 1rem;
	}

	.solo {
		box-sizing: border-box;
		max-width: 64rem;
		margin: 0 auto;
		padding: 1rem 1rem 2rem;
	}

	footer {
		@include chrome.footer;
	}

	.unofficial {
		@include text.muted(0.8125rem);
	}

	.brand {
		@include chrome.brand;
	}

	:global(.icon) {
		flex: none;
		width: 1.5rem;
		height: 1.5rem;
	}

	@include breakpoints.wide {
		.solo {
			padding: 2rem 1rem;
		}
	}
</style>
