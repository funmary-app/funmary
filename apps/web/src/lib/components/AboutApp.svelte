<script lang="ts">
	import { onMount } from 'svelte';
	import { createCopyState } from '#lib/clipboard.svelte.ts';
	import { isStandalone } from '#lib/standalone.ts';

	export interface About {
		build: { version: string; commit: string; buildNumber: number | null; builtAt: string } | null;
		client: { browser: string; os: string };
	}

	// フッターに出す、版とクライアントの情報。不具合を知らせてもらうときに、まとめてコピーして貼ってもらう
	let { about }: { about: About } = $props();

	// ホーム画面に追加したアプリとして開いているかは、ブラウザでしか分からない
	let standalone = $state(false);
	const copyState = createCopyState();

	onMount(() => {
		standalone = isStandalone();
	});

	const version = $derived(
		about.build
			? `${about.build.version}${about.build.buildNumber ? ` (ビルド ${about.build.buildNumber})` : ''}`
			: '開発版',
	);
	const client = $derived(
		`${about.client.browser}、${about.client.os}、${standalone ? 'PWA' : 'ブラウザ'}`,
	);

	function copy() {
		const lines = [
			`Funmary ${version}`,
			...(about.build
				? [`コミット ${about.build.commit}`, `ビルド日時 ${about.build.builtAt}`]
				: []),
			`クライアント ${client}`,
		];
		void copyState.copy(lines.join('\n'));
	}
</script>

<p class="about">
	<span
		>Funmary {version}{#if about.build}、{about.build.builtAt} ビルド{/if}</span
	>
	<span>{client}</span>
	<button type="button" onclick={copy}
		>{copyState.copied ? 'コピーしました' : '情報をコピー'}</button
	>
</p>

<style lang="scss">
	.about {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 0.75rem;
		margin: 0.25rem 0 0;
		color: var(--fm-text-muted);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
	}

	/* 文言が変わっても、幅と位置を変えない */
	button {
		min-width: 7rem;
		min-height: 32px;
		padding: 0 0.5rem;
		border: 1px solid var(--fm-divider);
		border-radius: 0.375rem;
		background: none;
		color: inherit;
		font: inherit;
		cursor: pointer;

		&:hover {
			background: var(--fm-surface-muted);
			color: var(--fm-text);
		}
	}
</style>
