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
	import IconBus from '~icons/material-symbols/directions-bus-outline';
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
			busEnabled: boolean;
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
		...(data.busEnabled
			? [
					{
						href: resolve('app/bus'),
						label: 'バス',
						icon: IconBus,
						current: page.url.pathname.startsWith('/app/bus'),
					},
				]
			: []),
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

	<main class:bus-page={page.url.pathname === '/app/bus'}>
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
	@use './layout';
</style>
