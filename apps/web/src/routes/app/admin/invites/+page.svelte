<script lang="ts">
	import Button, { Label } from '@smui/button';
	import type { InviteIssuers, InviteSettings } from '@funmary/core';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import InviteCodeList from '#lib/components/InviteCodeList.svelte';
	import type { InviteCodeView } from '#lib/server/invites.ts';
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';

	let {
		data,
		form,
	}: {
		data: {
			settings: InviteSettings;
			registration: 'invite' | 'open' | 'closed';
			codes: InviteCodeView[];
			users: { id: string; email: string; suspended: boolean; canInvite: boolean }[];
		};
		form: { error?: string; message?: string } | null;
	} = $props();

	const ISSUERS: { value: InviteIssuers; label: string; description: string }[] = [
		{ value: 'admin', label: '管理者のみ', description: '管理者だけが発行できます。' },
		{
			value: 'permitted',
			label: '許可したユーザー',
			description: '管理者と、下の一覧で許可した人が発行できます。',
		},
		{ value: 'anyone', label: '誰でも', description: 'ログインしている全員が発行できます。' },
	];

	// 保存していない選択は、保存した値とは別に持つ。一覧の「許可する」など、ほかの操作で data が読み直されても消えないようにし、
	// 保存できたときだけ消す (書き込める $derived だと、data が読み直されるたびに保存した値に戻ってしまう)
	let edited = $state<{ issuers?: InviteSettings['issuers']; monthlyLimit?: string }>({});
	const issuers = $derived(edited.issuers ?? data.settings.issuers);
	const monthlyLimit = $derived(edited.monthlyLimit ?? String(data.settings.monthlyLimit));
	const limitUsed = $derived(issuers !== 'admin');
	const dirty = $derived(
		issuers !== data.settings.issuers ||
			(limitUsed && monthlyLimit !== String(data.settings.monthlyLimit)),
	);
	const permittedCount = $derived(data.users.filter((user) => user.canInvite).length);
</script>

<svelte:head>
	<title>招待コードの管理 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page page-w-48">
	<SettingsBreadcrumb current="招待コードの管理" />
	<h1>招待コードの管理</h1>

	<p>
		招待コードの発行は、
		<a href={resolve('app/settings/invites')}>招待</a>
		の画面で行います。
	</p>

	{#if data.registration !== 'invite'}
		<p class="muted">
			いまの登録の方式 (REGISTRATION) は {data.registration} なので、招待コードは登録に使われません。
		</p>
	{/if}

	<FormNotice error={form?.error} message={form?.message} />

	<section aria-labelledby="settings-heading">
		<h2 id="settings-heading">発行できる人</h2>
		<!-- 既定の enhance は保存のあとにフォームをリセットし、欄が最初に描いた値に戻るので、リセットしない。
			保存できたら、保存していない選択を消し、保存した値を出す -->
		<form
			method="POST"
			action="?/saveSettings"
			use:enhance={() =>
				async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success') edited = {};
				}}
			class="entry"
		>
			<fieldset>
				<legend>モード</legend>
				{#each ISSUERS as issuer (issuer.value)}
					<label class="choice">
						<input
							type="radio"
							name="issuers"
							value={issuer.value}
							checked={issuers === issuer.value}
							onchange={() => (edited.issuers = issuer.value)}
						/>
						<span>
							<span class="choice-label">{issuer.label}</span>
							<span class="muted">{issuer.description}</span>
						</span>
					</label>
				{/each}
			</fieldset>
			<div class="limit" class:unused={!limitUsed}>
				<label for="monthly-limit">管理者でない人が 1 か月に発行できる数</label>
				<!-- 無効の欄は送られない。サーバーはいまの上限を残す -->
				<input
					id="monthly-limit"
					type="number"
					name="monthlyLimit"
					min="0"
					max="100"
					value={monthlyLimit}
					oninput={(event) => (edited.monthlyLimit = event.currentTarget.value)}
					disabled={!limitUsed}
					required
					aria-describedby="monthly-limit-note"
				/>
				<p id="monthly-limit-note" class="muted">
					{#if limitUsed}
						管理者でない人のコードは、1 回だけ使えて、30
						日で期限が切れます。管理者は制限なく発行できます。
					{:else}
						「管理者のみ」のときは使いません。ほかのモードにすると、この数が使われます。
					{/if}
				</p>
			</div>
			<div class="actions">
				<Button type="submit" variant="unelevated"><Label>保存する</Label></Button>
				<!-- 出し入れで保存のボタンが動かないよう、文の場所は常に取っておく -->
				<span class="muted" aria-live="polite">{dirty ? '保存していない変更があります' : ''}</span>
			</div>
		</form>
	</section>

	<section aria-labelledby="users-heading">
		<h2 id="users-heading">発行を許可する人</h2>
		<p class="muted">
			モードが「許可したユーザー」のときに使います。管理者は、許可しなくても発行できます。
		</p>
		{#if data.settings.issuers !== 'permitted'}
			<p class="notice">
				いまのモードは「{ISSUERS.find((issuer) => issuer.value === data.settings.issuers)
					?.label}」なので、ここでの許可は効いていません。モードを「許可したユーザー」にして保存すると効きます。
			</p>
		{:else if permittedCount === 0 && data.users.length > 0}
			<p class="notice">まだ誰も許可していないので、発行できるのは管理者だけです。</p>
		{/if}
		{#if data.users.length === 0}
			<p class="muted">管理者のほかに、利用者はいません。</p>
		{:else}
			<ul class="users">
				{#each data.users as user (user.id)}
					<li>
						<span class="email">
							{user.email}{#if user.suspended}<span class="muted"> (停止中)</span>{/if}
						</span>
						<form method="POST" action="?/setPermission" use:enhance>
							<input type="hidden" name="userId" value={user.id} />
							<input type="hidden" name="granted" value={String(!user.canInvite)} />
							<Button type="submit" variant={user.canInvite ? 'outlined' : 'unelevated'}>
								<Label
									>{user.canInvite ? '許可を外す' : '許可する'}<span class="visually-hidden"
										>: {user.email}</span
									></Label
								>
							</Button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section aria-labelledby="codes-heading">
		<h2 id="codes-heading">発行された招待コード</h2>
		<InviteCodeList codes={data.codes} showIssuer />
	</section>
</div>

<style lang="scss">
	@use 'mixins';

	section {
		margin-top: 2rem;
	}

	.entry {
		display: grid;
		gap: 1rem;
		padding: 1rem;
		border-radius: 0.75rem;
		background: var(--fm-surface-muted);
		justify-items: start;
	}

	fieldset {
		display: grid;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-bottom: 0.25rem;
		font-size: 0.875rem;
	}

	.choice {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		min-height: 44px;

		input {
			margin-top: 0.25rem;
		}

		> span {
			display: flex;
			flex-direction: column;
		}
	}

	.choice-label {
		font-weight: 700;
	}

	.limit {
		@include mixins.stack(0.25rem);
		font-size: 0.875rem;

		p {
			margin: 0;
		}

		input {
			width: 8rem;
		}

		input:disabled {
			opacity: 0.45;
			cursor: not-allowed;
		}
	}

	.limit.unused label {
		color: var(--fm-text-muted);
		opacity: 0.7;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;

		span {
			min-height: 1.25rem;
		}
	}

	.notice {
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		background: var(--fm-surface-muted);
		font-size: 0.875rem;
	}

	.users {
		margin: 0;
		padding: 0;
		list-style: none;

		li {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			justify-content: space-between;
			gap: 0.5rem;
			padding: 0.5rem 0;
			border-bottom: 1px dashed var(--fm-divider);
		}
	}

	/* 文言が変わっても、ボタンの幅と位置を変えない */
	.users form :global(button) {
		min-width: 8rem;
	}

	.email {
		overflow-wrap: anywhere;
	}
</style>
