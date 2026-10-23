<script lang="ts">
	import TextField from '#lib/components/TextField.svelte';
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { confirmSubmit } from '#lib/actions/confirm-submit.ts';
	import EventForm from '#lib/components/EventForm.svelte';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import type { EventFormValues } from '#lib/event-form.ts';

	let {
		data,
		form,
	}: {
		data: {
			values: EventFormValues;
			candidates: { date: string; label: string }[];
			keptExclusions: string[];
			shareUrl: string | null;
			grantedEmails: string[];
		};
		form: { error?: string; message?: string; values?: EventFormValues } | null;
	} = $props();
</script>

<svelte:head>
	<title>予定を直す - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<p><a href={resolve('app/events')}>自分の予定</a></p>
	<h1>予定を直す</h1>
	<FormNotice message={form?.message} />
	<EventForm
		values={form?.values ?? data.values}
		error={form?.error}
		submitLabel="保存する"
		action="?/save"
		candidates={data.candidates}
		keptExclusions={data.keptExclusions}
	/>

	{#if data.shareUrl}
		<section class="share" aria-labelledby="share-heading">
			<h2 id="share-heading">共有のリンク</h2>
			<p>
				このリンクを知っている、Funmary
				にログインした人が、この予定を見て、自分の時間割に加えられます。リンクを作り直すと、前のリンクは使えなくなります。公開範囲を変えても、使えなくなります。
			</p>
			<TextField class="share-url" label="リンク" readonly value={data.shareUrl} selectOnFocus />
			<form method="POST" action="?/rotate" use:enhance>
				<Button type="submit" variant="outlined"><Label>リンクを作り直す</Label></Button>
			</form>
		</section>
	{/if}

	{#if (form?.values ?? data.values).visibility === 'private'}
		<section class="invite" aria-labelledby="invite-heading">
			<h2 id="invite-heading">特定の人にだけ見せる</h2>
			<p>
				メールアドレスで招待した人は、非公開のままでもこの予定を見られます。そのメールアドレスが
				Funmary
				に登録されているかどうかにかかわらず、同じ案内を出します。自動では時間割に加わりません。
			</p>
			<form method="POST" action="?/grantAccess" use:enhance class="grant-form">
				<TextField
					class="grant-email"
					label="メールアドレス"
					type="email"
					name="email"
					maxlength={200}
					required
					autocomplete="off"
				/>
				<Button type="submit" variant="outlined"><Label>招待する</Label></Button>
			</form>
			{#if data.grantedEmails.length > 0}
				<ul class="grants">
					{#each data.grantedEmails as email (email)}
						<li>
							<span>{email}</span>
							<form method="POST" action="?/revokeAccess" use:enhance class="inline">
								<input type="hidden" name="email" value={email} />
								<Button type="submit" variant="outlined"
									><Label>外す<span class="visually-hidden">: {email}</span></Label></Button
								>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	<section class="danger" aria-labelledby="delete-heading">
		<h2 id="delete-heading">予定を消す</h2>
		<p>消した予定は、元に戻せません。繰り返しの予定は、すべての回が消えます。</p>
		<form
			method="POST"
			action="?/delete"
			use:confirmSubmit={'この予定を消します。元に戻せません。よろしいですか?'}
			use:enhance
		>
			<Button type="submit" variant="outlined"><Label>この予定を消す</Label></Button>
		</form>
	</section>
</div>

<style lang="scss">
	@use 'mixins';

	.share,
	.invite,
	.danger {
		margin-top: 2rem;
	}
	h2 {
		font-size: 1.1rem;
	}
	section > :global(.share-url) {
		width: 100%;
		margin-bottom: 0.75rem;
	}
	.grant-form {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.5rem 1rem;
		width: 100%;

		:global(.grant-email) {
			flex: 1 1 14rem;
		}
	}
	.grants {
		display: grid;
		gap: 0.25rem;
		width: 100%;
		margin: 0.75rem 0 0;
		padding: 0;
		list-style: none;

		li {
			@include mixins.cluster;
			justify-content: space-between;
			padding: 0.5rem 0.75rem;
			border-radius: 0.5rem;
			background: var(--fm-surface);
			overflow-wrap: anywhere;
		}
	}
</style>
