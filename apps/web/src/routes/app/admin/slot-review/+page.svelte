<script lang="ts">
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { confirmSubmit } from '#lib/actions/confirm-submit.ts';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';
	import type { SubjectPathParams } from '#lib/subject-path.ts';
	import { formatSlot } from '#lib/term-label.ts';

	interface PendingRow {
		id: number;
		subjectName: string;
		subjectPath: SubjectPathParams | null;
		weekday: number;
		period: number;
		room: string | null;
		submittedByEmail: string | null;
		submittedAt: string;
	}

	let {
		data,
		form,
	}: {
		data: {
			mode: 'open' | 'moderated' | 'closed';
			modes: { id: string; label: string }[];
			canChangeMode: boolean;
			pending: PendingRow[];
		};
		form: { error?: string; message?: string } | null;
	} = $props();
</script>

<svelte:head>
	<title>曜日と時限の確認 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<SettingsBreadcrumb current="曜日と時限の確認" />
	<h1>曜日と時限の確認</h1>

	<FormNotice error={form?.error} message={form?.message} />

	<section aria-labelledby="mode-heading">
		<h2 id="mode-heading">だれが共有の枠を登録できるか</h2>
		<p class="muted">個人用 (自分だけに使う曜日と時限) は、この設定に関わらずだれでも使えます。</p>
		{#if data.canChangeMode}
			<form method="POST" action="?/saveMode" use:enhance class="mode-form">
				{#each data.modes as mode (mode.id)}
					<label class="radio">
						<input type="radio" name="mode" value={mode.id} checked={mode.id === data.mode} />
						{mode.label}
					</label>
				{/each}
				<Button type="submit" variant="unelevated"><Label>保存する</Label></Button>
			</form>
		{:else}
			<p>いまの設定: {data.modes.find((mode) => mode.id === data.mode)?.label}</p>
			<p class="muted">この設定を変えられるのは、管理者だけです。</p>
		{/if}
	</section>

	<section aria-labelledby="pending-heading">
		<h2 id="pending-heading">確認待ち</h2>
		{#if data.pending.length === 0}
			<p>ありません。</p>
		{:else}
			<ul class="pending">
				{#each data.pending as submission (submission.id)}
					<li>
						<p class="meta">
							{#if submission.subjectPath}
								<a href={resolve('/app/subjects/[year]/[code]', submission.subjectPath)}
									>{submission.subjectName}</a
								>
							{:else}
								{submission.subjectName}
							{/if}
							{formatSlot(submission)}{#if submission.room}、{submission.room}{/if}
						</p>
						<p class="muted">
							提出: {submission.submittedByEmail ?? '(退会済み)'}、{submission.submittedAt}
						</p>
						<div class="actions">
							<form method="POST" action="?/approve" use:enhance>
								<input type="hidden" name="id" value={submission.id} />
								<Button type="submit" variant="unelevated"><Label>承認する</Label></Button>
							</form>
							<form
								method="POST"
								action="?/reject"
								use:confirmSubmit={'この提出を却下します。よろしいですか?'}
								use:enhance
							>
								<input type="hidden" name="id" value={submission.id} />
								<Button type="submit" variant="outlined"><Label>却下する</Label></Button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style lang="scss">
	@use 'mixins';

	section {
		margin-top: 2rem;
	}

	.mode-form {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: 0.5rem;
	}

	.radio {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
	}

	.pending {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.pending > li {
		margin: 0.75rem 0;
		padding: 0.75rem 1rem;
		border: 1px solid var(--fm-divider);
		border-radius: 0.5rem;
	}

	.meta {
		margin: 0;
	}

	.actions {
		@include mixins.wrap-row(0.5rem);
		margin-top: 0.5rem;
	}
</style>
