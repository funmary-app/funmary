<script lang="ts">
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import { confirmSubmit } from '#lib/actions/confirm-submit.ts';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';

	let {
		data,
		form,
	}: {
		data: {
			accounts: readonly {
				id: number;
				email: string;
				registered: boolean;
				lastLoginAt: string | null;
			}[];
			limit: number;
		};
		form: { error?: string; message?: string } | null;
	} = $props();
</script>

<svelte:head>
	<title>テストアカウント - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<SettingsBreadcrumb current="テストアカウント" />
	<h1>テストアカウント</h1>
	<p>
		大学のアカウントでない Google のアカウントで、Funmary
		にログインして、機能を試せるようにします。自分のデータは引き継がれず、空の状態から始まります。必要なら、自分の履修科目と予定を写せます。
	</p>

	<FormNotice error={form?.error ?? null} message={form?.message ?? null} />

	<h2>足す</h2>
	<form method="POST" action="?/add" use:enhance class="add">
		<label for="email">Google アカウントのメールアドレス (1 人 {data.limit} 個まで)</label>
		<input id="email" name="email" type="email" required autocomplete="off" spellcheck="false" />
		<div><Button type="submit" variant="outlined"><Label>足す</Label></Button></div>
	</form>
	<p class="muted">
		テストするときは、ログインの画面の「テストアカウントでログイン」から入ります。別のブラウザか、シークレットウィンドウを使うと、自分のアカウントと同時に使えます。
	</p>

	<h2>用意したアカウント</h2>
	{#if data.accounts.length === 0}
		<p class="muted">まだありません。</p>
	{:else}
		<ul class="accounts">
			{#each data.accounts as account (account.id)}
				<li>
					<p class="email">{account.email}</p>
					<p class="muted">
						{account.registered
							? `ログイン済み (最後のログイン: ${account.lastLoginAt ?? '不明'})`
							: 'まだログインしていません'}
					</p>
					<div class="row">
						{#if account.registered}
							<form
								method="POST"
								action="?/copy"
								use:confirmSubmit={'テストアカウントの履修科目と予定を、あなたのもので置き換えます。よろしいですか?'}
								use:enhance
							>
								<input type="hidden" name="id" value={account.id} />
								<Button type="submit" variant="outlined"><Label>自分のデータを写す</Label></Button>
							</form>
						{/if}
						<form
							method="POST"
							action="?/remove"
							use:confirmSubmit={'このテストアカウントと、そのデータを消します。よろしいですか?'}
							use:enhance
						>
							<input type="hidden" name="id" value={account.id} />
							<Button type="submit" variant="outlined"><Label>消す</Label></Button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style lang="scss">
	@use 'mixins';

	h2 {
		margin: 2.5rem 0 1rem;
	}

	.add {
		@include mixins.stack(0.5rem);
		max-width: 28rem;
	}

	.accounts {
		list-style: none;
		margin: 0;
		padding: 0;
		@include mixins.stack(1rem);

		li {
			padding: 1rem;
			border: 1px solid var(--fm-divider);
			border-radius: 0.5rem;
		}
	}

	.email {
		margin: 0;
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.row {
		@include mixins.wrap-row(0.5rem);
		margin-top: 0.5rem;
	}
</style>
