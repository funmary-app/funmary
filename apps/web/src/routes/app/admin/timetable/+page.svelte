<script lang="ts">
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { TimetableImportView } from '#lib/server/timetable-import-view.ts';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';

	let {
		form,
	}: {
		form: {
			error?: string | null;
			preview?: TimetableImportView & { id: string };
			result?: TimetableImportView;
		} | null;
	} = $props();

	let busy = $state(false);

	const submitting = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	};
</script>

<svelte:head>
	<title>授業時間割の取り込み - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#snippet summary(view: TimetableImportView)}
	{#if view.warnings.length > 0}
		<div class="warnings">
			<p>読み取りに警告があります。PDF と見比べて、内容を確かめてください。</p>
			<ul>
				{#each view.warnings as warning, i (i)}<li>{warning}</li>{/each}
			</ul>
		</div>
	{/if}
	<p>
		枠 {view.slotCount} 件 ({view.methodCounts
			.map((method) => `${method.label} ${method.count}`)
			.join('、')})
	</p>
	<!-- 件数が多いことがあるので、一覧は畳んでおき、件数だけを見せる。
	     まとめて書かれたコマは同じ授業名と曜日時限で複数の科目になり、PDF の文も重なりうるので、行は並びの番号で見分ける -->

	{#if view.toCheck.length > 0}
		<details>
			<summary
				>言い換えや分け方で決めた照合 {view.toCheck.length} 件 (取り違えがないか確かめる)</summary
			>
			<ul class="plain">
				{#each view.toCheck as item, i (i)}
					<li>{item.lessonName} → {item.subject} ({item.slot})</li>
				{/each}
			</ul>
		</details>
	{/if}
	{#if view.unmatched.length > 0}
		<details>
			<summary>照合できなかった名前 {view.unmatched.length} 件</summary>
			<ul class="plain">
				{#each view.unmatched as item, i (i)}
					<li>{item.lessonName}: {item.reason}</li>
				{/each}
			</ul>
		</details>
		<p class="muted">
			取り込むと記録され、
			<a href={resolve('app/admin/lessons')}>照合できなかった授業名</a>
			の画面で科目に紐付けられます。紐付けたあとに取り込み直すと、その枠も入ります。
		</p>
	{/if}
{/snippet}

<div class="page page-w-48">
	<SettingsBreadcrumb current="授業時間割の取り込み" />
	<h1>授業時間割の取り込み</h1>
	<p>
		大学が配る授業時間割の PDF (前期か後期)
		を選ぶと、科目と照合した結果を確かめてから、科目ごとの曜日、時限、教室として取り込めます。既に入っている枠は上書きしません。
	</p>
	<p class="muted">
		PDF は 512 KB まで上げられます。大きいときは、管理用コマンドの timetable import
		を使ってください。
	</p>

	<FormNotice error={form?.error} />

	{#if form?.result}
		{@const result = form.result}
		<section class="result" aria-labelledby="result-heading">
			<h2 id="result-heading">{result.title}を取り込みました</h2>
			<p role="status">{result.applied?.summary}</p>
			{#if result.applied && result.applied.conflicts.length > 0}
				<h3>既にある枠と教室が違うもの (上書きしていません)</h3>
				<ul class="plain">
					{#each result.applied.conflicts as conflict, i (i)}<li>{conflict}</li>{/each}
				</ul>
			{/if}
		</section>
	{/if}

	<section aria-labelledby="upload-heading">
		<h2 id="upload-heading">PDF を読み取る</h2>
		<form
			method="POST"
			action="?/previewPdf"
			enctype="multipart/form-data"
			use:enhance={submitting}
			class="entry"
		>
			<label>
				授業時間割の PDF
				<input type="file" name="pdf" accept="application/pdf,.pdf" required />
			</label>
			<label>
				年度 (空なら PDF の表題から読む)
				<input type="number" name="year" min="2020" max="2100" inputmode="numeric" />
			</label>
			<Button type="submit" variant="unelevated" disabled={busy}>
				<Label>{busy ? '読み取っています' : '読み取る'}</Label>
			</Button>
		</form>
	</section>

	{#if form?.preview}
		{@const preview = form.preview}
		<section class="preview" aria-labelledby="preview-heading">
			<h2 id="preview-heading">{preview.title} (PDF から読んだ内容)</h2>
			{@render summary(preview)}
			<form method="POST" action="?/applyPdf" use:enhance={submitting} class="apply">
				<input type="hidden" name="id" value={preview.id} />
				{#if preview.warnings.length > 0}
					<label class="confirm">
						<input type="checkbox" name="confirmWarnings" required />
						警告の内容を確かめました
					</label>
				{/if}
				<Button type="submit" variant="unelevated" disabled={busy}>
					<Label>この内容で取り込む</Label>
				</Button>
			</form>
		</section>
	{/if}
</div>

<style lang="scss">
	@use 'mixins';

	section {
		margin-top: 2rem;
	}

	.entry {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.75rem 1rem;
		padding: 1rem;
		border-radius: 0.75rem;
		background: var(--fm-surface-muted);

		label {
			@include mixins.stack(0.25rem);
			font-size: 0.875rem;
		}

		input[type='number'] {
			width: 8rem;
		}
	}

	.preview,
	.result {
		padding: 1rem 1.25rem;
		border-radius: 0.75rem;
		background: var(--fm-primary-soft);

		h2 {
			margin-top: 0;
		}
	}

	details {
		margin-top: 0.75rem;
	}

	summary {
		min-height: 44px;
		align-content: center;
		font-weight: 700;
		cursor: pointer;
	}

	h3 {
		margin: 1rem 0 0.25rem;
		font-size: 0.9375rem;
	}

	.plain {
		margin: 0;
		padding-left: 1.25rem;
		overflow-wrap: anywhere;
	}

	.warnings {
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		background: var(--fm-surface-muted);
		color: var(--fm-error);

		p {
			margin: 0;
		}
	}

	.apply {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1rem;
		margin-top: 1rem;
	}

	.confirm {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
	}
</style>
