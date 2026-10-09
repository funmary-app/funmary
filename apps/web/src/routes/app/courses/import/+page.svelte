<script lang="ts">
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { createCopyState } from '#lib/clipboard.svelte.ts';
	import FormNotice from '#lib/components/FormNotice.svelte';

	interface ImportSummary {
		read: number;
		rejected: number;
		registered: number;
		slotsAdded: number;
		slotsUpdated: number;
		unknown: number;
		conflicts: number;
	}

	let {
		data,
		form,
	}: {
		data: { bookmarklet: string; script: string };
		form: { error?: string; result?: ImportSummary } | null;
	} = $props();

	/** 読み取りのコードを動かす方法。ブックマークに登録するか、ブラウザのコンソールに貼るか */
	let method: 'bookmark' | 'console' = $state('bookmark');
	const copyState = createCopyState();

	async function copyScript() {
		const ok = await copyState.copy(data.script);
		// コピーできないときは、欄を選んで、手でコピーしてもらう
		if (!ok) scriptField?.select();
	}
	let scriptField: HTMLTextAreaElement | undefined = $state();

	/** ブックマークレットが URL の # 以降に入れた内容。サーバーには、ボタンを押したときだけ送る */
	let payload = $state('');

	onMount(() => {
		const hash = location.hash.slice(1);
		if (hash === '') return;
		payload = hash;
		// 再読み込みや、履歴から開き直したときに、同じ内容が残らないよう、URL から消す
		history.replaceState(history.state, '', location.pathname + location.search);
	});
</script>

<svelte:head>
	<title>時間割の取り込み - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page page-w-40">
	<h1>ポータルの時間割から取り込む</h1>

	<p class="note">
		授業の曜日、時限、教室は、大学から自動では取得できません。そのため、利用者どうしで登録しています。
		ここで取り込んだ曜日、時限、教室は、同じ科目を履修しているほかの利用者の時間割にも使われます。
	</p>

	<FormNotice error={form?.error} />

	{#if form?.result}
		<section aria-labelledby="result-heading">
			<h2 id="result-heading">取り込みの結果</h2>
			<ul>
				<li>読み取ったコマ: {form.result.read} 件</li>
				<li>新しく履修登録した科目: {form.result.registered} 件</li>
				<li>新しく登録した曜日と時限: {form.result.slotsAdded} 件</li>
				{#if form.result.slotsUpdated > 0}
					<li>教室を埋めた枠: {form.result.slotsUpdated} 件</li>
				{/if}
				{#if form.result.unknown > 0}
					<li>
						まだ Funmary に取り込まれていない科目: {form.result.unknown} 件 (シラバスの取り込みのあとに、もう一度お試しください)
					</li>
				{/if}
				{#if form.result.conflicts > 0}
					<li>
						ほかの利用者の登録と教室が違ったもの: {form.result.conflicts} 件 (上書きせず、管理者が確かめます)
					</li>
				{/if}
				{#if form.result.rejected > 0}
					<li>読めなかったコマ: {form.result.rejected} 件</li>
				{/if}
			</ul>
		</section>
	{/if}

	{#if payload}
		<!-- 画面を切り替えずに送る。POST で開いたページが履歴に残ると、iPhone の Safari では、そこから移った画面の再読み込みで、同じ POST をその画面に送り直して 405 になる -->
		<form
			method="POST"
			use:enhance={() =>
				async ({ update }) => {
					// 取り込んだら (読めなかったときも) ボタンを消す。同じ内容を 2 回送らないため
					payload = '';
					await update();
				}}
		>
			<input type="hidden" name="payload" value={payload} />
			<p>ポータルの時間割を読み取りました。取り込むと、履修科目として登録します。</p>
			<Button type="submit" variant="unelevated"><Label>取り込む</Label></Button>
		</form>
	{:else}
		<h2>使い方</h2>
		<div class="methods" role="group" aria-label="取り込みの方法">
			<button
				type="button"
				aria-pressed={method === 'bookmark'}
				onclick={() => (method = 'bookmark')}
			>
				ブックマークに登録する
			</button>
			<button
				type="button"
				aria-pressed={method === 'console'}
				onclick={() => (method = 'console')}
			>
				コンソールで実行する
			</button>
		</div>
		{#if method === 'bookmark'}
			<ol>
				<li>
					下のリンクを、ブラウザのブックマークバーにドラッグして登録します。
					<!-- ブックマークレットは、画面の経路ではない。サーバーが決まったコードから作った値だけを入れる -->
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a class="bookmarklet" href={data.bookmarklet}>Funmary に時間割を取り込む</a>
				</li>
				<li>学生ポータルにログインし、時間割のページ (Pt/TimeTable) を開きます。</li>
				<li>登録したブックマークを押すと、この画面に戻ります。「取り込む」を押してください。</li>
			</ol>
		{:else}
			<ol>
				<li>
					下のボタンで、取り込みのコードをコピーします。
					<textarea
						class="script"
						readonly
						rows="4"
						aria-label="取り込みのコード"
						bind:this={scriptField}>{data.script}</textarea
					>
					<div class="copy">
						<button type="button" onclick={copyScript}>コードをコピーする</button>
						<span role="status">{copyState.copied ? 'コピーしました' : ''}</span>
					</div>
				</li>
				<li>学生ポータルにログインし、時間割のページ (Pt/TimeTable) を開きます。</li>
				<li>
					F12 キーで開発者ツールを開き、「コンソール」に、コピーしたコードを貼り付けて Enter
					を押します。貼り付けを止められたときは、画面の案内に従って許可してください。
				</li>
				<li>この画面に戻るので、「取り込む」を押してください。</li>
			</ol>
		{/if}
		<p>
			ポータルのパスワードは、Funmary
			には送られません。読み取りは、あなたのブラウザの中だけで行います。
		</p>
	{/if}
</div>

<style lang="scss">
	@use 'mixins';

	.note {
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		background: var(--fm-surface-muted);
	}
	.methods {
		@include mixins.wrap-row(0.25rem);
		margin-bottom: 0.5rem;
	}
	.methods button,
	.copy button {
		min-height: 48px;
		padding: 0 1rem;
		border: 1px solid var(--fm-divider);
		border-radius: 0.5rem;
		background: var(--fm-surface);
		color: var(--fm-text);
		font: inherit;
		cursor: pointer;
	}
	.methods button:hover,
	.copy button:hover {
		background: var(--fm-surface-muted);
	}
	.methods button[aria-pressed='true'] {
		border-color: var(--fm-primary);
		background: var(--fm-primary-soft);
	}
	.script {
		display: block;
		box-sizing: border-box;
		width: 100%;
		margin: 0.5rem 0;
		padding: 0.5rem;
		border: 1px solid var(--fm-outline);
		border-radius: 0.25rem;
		background: var(--fm-surface);
		color: var(--fm-text);
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
	}
	.copy {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.copy [role='status'] {
		color: var(--fm-text-muted);
		font-size: 0.875rem;
	}
	.bookmarklet {
		display: inline-block;
		margin: 0.25rem 0;
		padding: 0.25rem 0.75rem;
		border: 1px dashed currentcolor;
		border-radius: 0.25rem;
	}
</style>
