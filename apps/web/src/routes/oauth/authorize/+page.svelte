<script lang="ts">
	import CheckboxField from '#lib/components/CheckboxField.svelte';
	import Button, { Label } from '@smui/button';
	import FormNotice from '#lib/components/FormNotice.svelte';

	let {
		data,
		form,
	}: {
		data: {
			fatal: string | null;
			clientName?: string;
			redirectHost?: string;
			email?: string;
			scopes?: readonly { scope: string; label: string; write: boolean }[];
		};
		form: { error?: string } | null;
	} = $props();
</script>

<svelte:head>
	<title>アクセスの許可 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page page-w-36">
	<h1>アクセスの許可</h1>

	{#if data.fatal}
		<FormNotice error={data.fatal} />
	{:else}
		<FormNotice error={form?.error ?? null} />
		<p>
			<strong>{data.clientName}</strong> が、<strong>{data.email}</strong> の Funmary のデータへのアクセスを求めています。
		</p>
		{#if data.scopes?.some((option) => option.write)}
			<p class="warning">
				書き込みの範囲も求めています。許可すると、あなたの予定を足す、直す、消す、通知を既読にすることができます。必要なものだけに、チェックを入れてください
				(書き込みは、初めはオフです)。
			</p>
		{:else}
			<p>許可しても、データを書き換えることはできません。</p>
		{/if}
		<form method="POST">
			<fieldset>
				<legend>許可する範囲</legend>
				{#each data.scopes ?? [] as option (option.scope)}
					<CheckboxField name="scope" value={option.scope} checked={!option.write}
						>{option.label}</CheckboxField
					>
				{/each}
			</fieldset>
			<p class="destination">許可すると、<code>{data.redirectHost}</code> に戻ります。</p>
			<div class="actions">
				<Button type="submit" name="decision" value="allow" variant="unelevated">
					<Label>許可する</Label>
				</Button>
				<Button type="submit" name="decision" value="deny" variant="outlined">
					<Label>許可しない</Label>
				</Button>
			</div>
		</form>
		<p class="hint">許可したあとも、設定の「公開 API と MCP」からいつでも取り消せます。</p>
	{/if}
</div>

<style lang="scss">
	@use 'mixins';

	fieldset {
		margin: 1.5rem 0;
		padding: 1rem;
		border: 1px solid var(--fm-divider);
		border-radius: 0.5rem;
	}

	.warning {
		padding: 0.75rem 1rem;
		border: 1px solid var(--fm-accent, currentcolor);
		border-radius: 0.5rem;
		font-weight: 700;
	}

	.destination {
		overflow-wrap: anywhere;
	}

	.actions {
		@include mixins.wrap-row(0.75rem);
	}

	.hint {
		margin-top: 1.5rem;
		color: var(--fm-text-muted);
	}
</style>
