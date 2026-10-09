<script lang="ts">
	import Button, { Label } from '@smui/button';
	import type { InviteIssuance } from '@funmary/core';
	import { enhance } from '$app/forms';
	import { createCopyState } from '#lib/clipboard.svelte.ts';
	import CopyField from '#lib/components/CopyField.svelte';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import InviteCodeList from '#lib/components/InviteCodeList.svelte';
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';
	import type { InviteCodeView } from '#lib/server/invites.ts';

	let {
		data,
		form,
	}: {
		data: {
			issuance: InviteIssuance;
			registration: 'invite' | 'open' | 'closed';
			codes: InviteCodeView[];
		};
		form: {
			error?: string;
			message?: string;
			issued?: { code: string; url: string; expiresAt: string | null };
		} | null;
	} = $props();

	const copyState = createCopyState();

	const canIssue = $derived(data.issuance.kind === 'admin' || data.issuance.kind === 'member');
</script>

<svelte:head>
	<title>招待 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<SettingsBreadcrumb current="招待" />
	<h1>招待</h1>
	<p>
		招待コードを渡すと、その人が Funmary に登録できます。コードは、渡したい人にだけ伝えてください。
	</p>
	{#if data.registration !== 'invite'}
		<p class="muted">
			{data.registration === 'open'
				? 'いまは誰でも登録できる設定なので、招待コードがなくても登録できます。'
				: 'いまは新しい登録を受け付けていない設定なので、招待コードでも登録できません。'}
		</p>
	{/if}

	<FormNotice error={form?.error} message={form?.message} />

	{#if form?.issued}
		{@const issued = form.issued}
		<section class="issued" aria-labelledby="issued-heading">
			<h2 id="issued-heading">招待コードを発行しました</h2>
			<p>この画面を離れると、もう出せません。登録の URL を、渡したい人に送ってください。</p>
			<CopyField
				id="invite-url"
				label="登録の URL"
				value={issued.url}
				{copyState}
				variant="unelevated"
				flexBasis="16rem"
			/>
			<p class="muted" role="status">{copyState.copied ? 'コピーしました。' : ''}</p>
			<p class="muted">
				コード: <code>{issued.code}</code>{#if issued.expiresAt}
					。期限: {issued.expiresAt}{/if}
			</p>
		</section>
	{/if}

	<section aria-labelledby="issue-heading">
		<h2 id="issue-heading">発行する</h2>
		{#if data.issuance.kind === 'not-allowed'}
			<p class="muted">いまは、管理者が許可した人だけが招待コードを発行できます。</p>
		{:else if data.issuance.kind === 'limit-reached'}
			<p class="muted">
				今月は、発行できる数 ({data.issuance.limit} つ) に達しました。来月になると、また発行できます。
			</p>
		{:else if data.issuance.kind === 'member'}
			<p class="muted">
				コードは 1 回だけ使えて、30 日で期限が切れます。今月はあと {data.issuance.remaining}
				つ発行できます。
			</p>
		{/if}

		{#if canIssue}
			<form
				method="POST"
				action="?/issue"
				use:enhance={() => {
					copyState.reset();
				}}
				class="entry"
			>
				{#if data.issuance.kind === 'admin'}
					<label>
						使用回数
						<input type="number" name="uses" min="1" max="100" value="1" required />
					</label>
					<label>
						期限 (日数。空なら期限なし)
						<input type="number" name="days" min="1" max="365" value="30" />
					</label>
				{/if}
				<label>
					メモ (誰に渡したか。自分と管理者だけが見られます)
					<input type="text" name="note" maxlength="100" autocomplete="off" />
				</label>
				<Button type="submit" variant="unelevated"><Label>招待コードを発行する</Label></Button>
			</form>
		{/if}
	</section>

	<section aria-labelledby="codes-heading">
		<h2 id="codes-heading">発行した招待コード</h2>
		<InviteCodeList codes={data.codes} />
	</section>
</div>

<style lang="scss">
	@use 'mixins';

	section {
		margin-top: 2rem;
	}

	.issued {
		padding: 1rem 1.25rem;
		border-radius: 0.75rem;
		background: var(--fm-primary-soft);

		h2 {
			margin-top: 0;
		}
	}

	code {
		overflow-wrap: anywhere;
	}

	.entry {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.75rem 1rem;
		margin-top: 1rem;
		padding: 1rem;
		border-radius: 0.75rem;
		background: var(--fm-surface-muted);

		label {
			@include mixins.stack(0.25rem);
			font-size: 0.875rem;
		}
	}
</style>
