<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AboutApp, { type About } from '#lib/components/AboutApp.svelte';
	import BrandLogo from '#lib/components/BrandLogo.svelte';
	import FooterLinks from '#lib/components/FooterLinks.svelte';
	import MaskedEmail from '#lib/components/MaskedEmail.svelte';
	import NotificationBell from '#lib/components/NotificationBell.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import type { ThemePreference } from '#lib/theme.ts';
	import IconCourses from '~icons/material-symbols/menu-book-outline';
	import IconHome from '~icons/material-symbols/home-outline';
	import IconSettings from '~icons/material-symbols/settings-outline';
	import IconWeek from '~icons/material-symbols/calendar-view-week-outline';

	// スマホの上部バーは、下へのスクロールで隠し、上へのスクロールで出す (Issue #109)。ページの一番上では常に出す
	let headerHidden = $state(false);

	$effect(() => {
		let lastY = window.scrollY;
		const HIDE_THRESHOLD = 8;
		function onScroll() {
			const y = window.scrollY;
			const delta = y - lastY;
			if (y <= 0) headerHidden = false;
			else if (delta > HIDE_THRESHOLD) headerHidden = true;
			else if (delta < -HIDE_THRESHOLD) headerHidden = false;
			lastY = y;
		}
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});

	let {
		data,
		children,
	}: {
		data: {
			user: { email: string };
			theme: ThemePreference;
			about: About;
			operator: { name: string; url: string } | null;
			unreadNotifications: number;
		};
		children: Snippet;
	} = $props();

	// PC では左のメニュー、スマホでは下のタブに同じ項目を出す。
	// 管理は設定の中にあるので、管理の画面を開いているときも設定を選んだ状態にする
	const items = $derived([
		{
			href: resolve('app'),
			label: 'ホーム',
			icon: IconHome,
			current: page.url.pathname === '/app',
		},
		{
			href: resolve('app/week'),
			label: '時間割',
			icon: IconWeek,
			current: page.url.pathname.startsWith('/app/week'),
		},
		{
			href: resolve('app/courses'),
			label: '科目',
			icon: IconCourses,
			current:
				page.url.pathname.startsWith('/app/courses') ||
				page.url.pathname.startsWith('/app/subjects'),
		},
		{
			href: resolve('app/settings'),
			label: '設定',
			icon: IconSettings,
			current:
				page.url.pathname.startsWith('/app/settings') || page.url.pathname.startsWith('/app/admin'),
		},
	]);
</script>

{#snippet navItems(className: string)}
	<ul class={className}>
		{#each items as item (item.href)}
			<li>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href は resolve 済み -->
				<a href={item.href} aria-current={item.current ? 'page' : undefined}>
					<item.icon aria-hidden="true" class="icon" />
					<span>{item.label}</span>
				</a>
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet unofficial()}
	<p class="unofficial">Funmary は公立はこだて未来大学の公式のアプリではありません。</p>
	<FooterLinks operator={data.operator} />
{/snippet}

<div class="shell">
	<header class="top" class:hidden={headerHidden}>
		<a class="brand" href={resolve('app')}><BrandLogo height="1.75rem" /></a>
		<div class="top-actions">
			<NotificationBell unread={data.unreadNotifications} compact />
			<ThemeToggle initial={data.theme} compact />
		</div>
	</header>

	<nav class="side" aria-label="メニュー">
		<a class="brand" href={resolve('app')}><BrandLogo height="1.75rem" /></a>
		{@render navItems('side-items')}
		<div class="account">
			<div class="email"><MaskedEmail email={data.user.email} /></div>
			<NotificationBell unread={data.unreadNotifications} />
			<ThemeToggle initial={data.theme} />
		</div>
	</nav>

	<main>
		{@render children()}
		<footer>
			{@render unofficial()}
			<AboutApp about={data.about} />
		</footer>
	</main>

	<nav class="tabs" aria-label="メニュー">
		{@render navItems('tab-items')}
	</nav>
</div>

<style lang="scss">
	@use 'mixins';

	@use 'breakpoints';

	.shell {
		min-height: 100dvh;
	}

	main {
		box-sizing: border-box;
		max-width: 72rem;
		padding: 1rem 1rem 6rem;
	}

	footer {
		margin-top: 3rem;
		padding-top: 1rem;
		border-top: 1px dashed var(--fm-divider);
	}

	.unofficial {
		margin: 0;
		color: var(--fm-text-muted);
		font-size: 0.8125rem;
	}

	.brand {
		color: var(--fm-primary);
		font-weight: 700;
		font-size: 1.125rem;
		letter-spacing: 0.02em;
		text-decoration: none;
	}

	/* 左のメニューでは、画面の色のボタンを、横幅いっぱいの高さにそろえる */
	.account :global(.bell) {
		box-sizing: border-box;
		width: 100%;
	}

	.account :global(.toggle) {
		justify-content: flex-start;
		width: 100%;
		height: 48px;
	}

	/* スマホ: 上に名前、下にタブ。上のバーは貼り付け、下へのスクロールで隠す (Issue #109) */
	.top {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.25rem 0.5rem 0.25rem 1rem;
		border-bottom: 1px dashed var(--fm-divider);
		background: var(--fm-surface);
		transition: transform 200ms ease-out;

		&.hidden {
			transform: translateY(-100%);
		}

		@media (prefers-reduced-motion: reduce) {
			transition: none;
		}
	}

	.side {
		display: none;
	}

	.tabs {
		position: fixed;
		inset: auto 0 0;
		z-index: 1;
		border-top: 1px solid var(--fm-divider);
		background: var(--fm-surface);
		padding-bottom: env(safe-area-inset-bottom);
	}

	.tabs .tab-items {
		display: flex;
		margin: 0;
		padding: 0;
		list-style: none;

		li {
			flex: 1;
		}

		a {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 0.125rem;
			min-height: 56px;
			padding: 0.375rem 0 0.25rem;
			color: var(--fm-text-muted);
			font-size: 0.75rem;
			text-decoration: none;
		}

		a :global(.icon) {
			/* svg の大きさは、既定では中の属性 (幅・高さの em 指定) 任せになる。この svg 自身に padding を
			   足しているので、box-sizing: border-box (base.scss で全体に効かせている) のままだと、
			   padding の分だけ中身が削られて (横方向は 0 になって) 見えなくなる。padding は大きさの外に
			   足りたいので、この要素だけ content-box に戻す */
			box-sizing: content-box;
			padding: 0.125rem 1rem;
			border-radius: 1rem;
			transition: background-color 150ms ease-out;
		}

		a[aria-current='page'] {
			color: var(--fm-primary);
			font-weight: 700;
		}

		a[aria-current='page'] :global(.icon) {
			background: var(--fm-primary-soft);
		}
	}

	/* PC: 左に常に出すメニュー */
	@include breakpoints.wide {
		.shell {
			display: grid;
			grid-template-columns: 15rem minmax(0, 1fr);
		}

		.top,
		.tabs {
			display: none;
		}

		.side {
			position: sticky;
			top: 0;
			@include mixins.stack(1.5rem);
			box-sizing: border-box;
			height: 100dvh;
			/* 高さが足りないときは、下の要素を上の要素に重ねず、メニューの中でスクロールする */
			overflow-y: auto;
			padding: 1.5rem 1rem;
			border-right: 1px dashed var(--fm-divider);
		}

		.side .brand {
			padding: 0 0.75rem;
		}

		main {
			padding: 2rem 2.5rem 3rem;
		}
	}

	.side .side-items {
		@include mixins.stack(0.25rem);
		margin: 0;
		padding: 0;
		list-style: none;

		a {
			display: flex;
			align-items: center;
			gap: 0.75rem;
			min-height: 44px;
			padding: 0 0.75rem;
			border: 1px solid transparent;
			border-radius: 0.5rem;
			color: var(--fm-text-muted);
			text-decoration: none;
			transition:
				background-color 150ms ease-out,
				color 150ms ease-out;
		}

		a:hover {
			background: var(--fm-surface-muted);
			color: var(--fm-text);
		}

		a[aria-current='page'] {
			border-color: var(--fm-divider);
			background: var(--fm-surface);
			color: var(--fm-text);
			font-weight: 700;
		}

		a[aria-current='page'] :global(.icon) {
			color: var(--fm-primary);
		}
	}

	.account {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		flex-shrink: 0;
		margin-top: auto;
		padding-top: 1rem;
		border-top: 1px dashed var(--fm-divider);
	}

	.email {
		width: 100%;
		color: var(--fm-text-muted);
		font-size: 0.8125rem;
	}

	.top-actions {
		display: flex;
		align-items: center;
	}
</style>
