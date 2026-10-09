<script lang="ts">
	import IconDark from '~icons/material-symbols/dark-mode-outline';
	import IconLight from '~icons/material-symbols/light-mode-outline';
	import IconSystem from '~icons/material-symbols/contrast-outline';
	import { nextThemePreference, THEME_COOKIE, type ThemePreference } from '#lib/theme.ts';

	// 画面の色を、自動 (端末の設定に従う)、ライト、ダークの順に切り替える。設定は Cookie に置き、次の読み込みではサーバーが反映する
	let { initial, compact = false }: { initial: ThemePreference; compact?: boolean } = $props();

	let theme = $derived(initial);

	const LABELS: Record<ThemePreference, string> = {
		system: '自動',
		light: 'ライト',
		dark: 'ダーク',
	};
	const ICONS = { system: IconSystem, light: IconLight, dark: IconDark };

	const Icon = $derived(ICONS[theme]);

	function cycle() {
		const next = nextThemePreference(theme);
		theme = next;
		document.documentElement.dataset['theme'] = next;
		const secure = location.protocol === 'https:' ? '; secure' : '';
		document.cookie =
			next === 'system'
				? `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`
				: `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax${secure}`;
	}
</script>

<button
	type="button"
	class={['toggle', { compact }]}
	onclick={cycle}
	aria-label={`画面の色: ${LABELS[theme]} (押すと${LABELS[nextThemePreference(theme)]}に切り替えます)`}
>
	<Icon aria-hidden="true" class="icon" />
	{#if !compact}
		<!-- 3 つの表示名を重ねて置き、いちばん長いものの幅にそろえる (設定を変えても、押せる範囲が変わらない) -->
		<span class="labels">
			{#each Object.entries(LABELS) as [key, label] (key)}
				<span class={{ current: key === theme }} aria-hidden="true">{label}</span>
			{/each}
		</span>
	{/if}
</button>

<style lang="scss">
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		min-width: 48px;
		min-height: 48px;
		padding: 0 0.75rem;
		border: 0;
		border-radius: 0.5rem;
		background: none;
		color: var(--fm-text-muted);
		font: inherit;
		font-size: 0.875rem;
		cursor: pointer;
	}
	.toggle:hover {
		background: var(--fm-surface-muted);
		color: var(--fm-text);
	}
	.labels {
		display: inline-grid;
		text-align: left;
	}
	.labels > span {
		grid-area: 1 / 1;
	}
	.labels > span:not(.current) {
		visibility: hidden;
	}
	.compact {
		justify-content: center;
		width: 48px;
		height: 48px;
		padding: 0;
	}
	.toggle :global(.icon) {
		width: 1.5rem;
		height: 1.5rem;
	}
</style>
