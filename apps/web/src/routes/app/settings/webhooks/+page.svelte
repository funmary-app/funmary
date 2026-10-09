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
			limit: number;
			count: number;
			kindOptions: readonly { kind: string; label: string }[];
			webhooks: readonly {
				id: number;
				kind: 'discord' | 'generic';
				label: string | null;
				maskedUrl: string;
				kinds: readonly string[];
				enabled: boolean;
				disabledReason: string | null;
			}[];
		};
		form: { error?: string; message?: string; id?: number; signingKey?: string } | null;
	} = $props();

	const canAdd = $derived(data.count < data.limit);

	let newKind = $state<'discord' | 'generic'>('discord');
	let newUrl = $state('');
	let newLabel = $state('');

	const KIND_LABELS = { discord: 'Discord', generic: '汎用' } as const;
</script>

<svelte:head>
	<title>Webhook - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page page-w-40">
	<SettingsBreadcrumb current="Webhook" />
	<h1>Webhook</h1>
	<p>
		休講、補講、教室変更などを、自分の Discord サーバーのチャンネルか、自分で用意した URL
		に届けます。
	</p>
	<p>送り先ごとに、届ける通知の種類を分けることもできます。</p>
	<p>登録できるのは {data.limit} 個までです (いま {data.count} 個)。</p>

	<FormNotice error={form?.error} message={form?.message} />
	{#if form?.signingKey && form.id === undefined}
		<div class="key-box" role="status">
			<p>署名の鍵 (今だけ表示します。コピーしてから閉じてください):</p>
			<code>{form.signingKey}</code>
		</div>
	{/if}

	{#if data.webhooks.length > 0}
		<ul class="webhooks">
			{#each data.webhooks as webhook (webhook.id)}
				<li class="webhook">
					<h2>
						{webhook.label ?? '名前なし'}
						<span class="badge kind">{KIND_LABELS[webhook.kind]}</span>
						{#if !webhook.enabled}<span class="badge">無効</span>{/if}
					</h2>
					<p class="meta">{webhook.maskedUrl}</p>
					{#if !webhook.enabled && webhook.disabledReason}
						<p class="notice error" role="status">
							止めました: {webhook.disabledReason}。直したら、有効に戻してください。
						</p>
					{/if}
					{#if webhook.kind === 'generic' && form?.id === webhook.id && form.signingKey}
						<div class="key-box" role="status">
							<p>新しい署名の鍵 (今だけ表示します。コピーしてから閉じてください):</p>
							<code>{form.signingKey}</code>
						</div>
					{/if}
					<form
						method="POST"
						action="?/update"
						use:enhance={() =>
							({ update }) =>
								update({ reset: false })}
						class="stack"
					>
						<input type="hidden" name="id" value={webhook.id} />
						<label class="field">
							名前 (任意)
							<input type="text" name="label" value={webhook.label ?? ''} maxlength="40" />
						</label>
						<fieldset>
							<legend>届ける通知</legend>
							{#each data.kindOptions as option (option.kind)}
								<label class="check">
									<input
										type="checkbox"
										name="kinds"
										value={option.kind}
										checked={webhook.kinds.includes(option.kind)}
									/>
									{option.label}
								</label>
							{/each}
						</fieldset>
						<Button type="submit" variant="outlined"><Label>保存する</Label></Button>
					</form>
					<div class="actions">
						<form method="POST" action="?/test" use:enhance>
							<input type="hidden" name="id" value={webhook.id} />
							<Button type="submit" variant="outlined" disabled={!webhook.enabled}>
								<Label>テスト通知を送る</Label>
							</Button>
						</form>
						{#if webhook.kind === 'generic'}
							<form
								method="POST"
								action="?/regenerateKey"
								use:enhance
								use:confirmSubmit={'署名の鍵を作り直します。古い鍵は使えなくなります。よろしいですか?'}
							>
								<input type="hidden" name="id" value={webhook.id} />
								<Button type="submit" variant="outlined"><Label>署名の鍵を作り直す</Label></Button>
							</form>
						{/if}
						<form method="POST" action="?/toggle" use:enhance>
							<input type="hidden" name="id" value={webhook.id} />
							<Button type="submit" variant="outlined">
								<Label>{webhook.enabled ? '無効にする' : '有効に戻す'}</Label>
							</Button>
						</form>
						<form
							method="POST"
							action="?/remove"
							use:confirmSubmit={'この Webhook を削除します。よろしいですか?'}
							use:enhance
						>
							<input type="hidden" name="id" value={webhook.id} />
							<Button type="submit" variant="outlined"><Label>削除する</Label></Button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<section aria-labelledby="add-heading">
		<h2 id="add-heading">Webhook を登録する</h2>
		{#if canAdd}
			<fieldset class="kind-choice">
				<legend>種類</legend>
				<label class="check">
					<input type="radio" name="newKind" value="discord" bind:group={newKind} form="add-form" />
					Discord の Webhook
				</label>
				<label class="check">
					<input type="radio" name="newKind" value="generic" bind:group={newKind} form="add-form" />
					汎用の Webhook (自分で用意した URL)
				</label>
			</fieldset>
			{#if newKind === 'discord'}
				<ol class="steps">
					<li>Discord で、通知を受け取るチャンネルの設定を開きます。</li>
					<li>「連携サービス」の「ウェブフック」から、新しいウェブフックを作ります。</li>
					<li>「ウェブフック URL をコピー」を押して、下の欄に貼り付けます。</li>
					<li>登録すると、テスト通知が届きます。届いたことを確かめてください。</li>
				</ol>
			{:else}
				<ol class="steps">
					<li>
						通知を受け取る https の URL を、自分で用意します。ポートは 443 か 8443 だけ使えます。
					</li>
					<li>
						登録すると、署名の鍵を作り、Standard Webhooks
						の形式でテスト通知を送ります。鍵は、登録した直後だけ画面に出ます。
					</li>
					<li>届いた本文の署名を、その鍵で確かめてください。</li>
				</ol>
			{/if}
			<!-- 送信のあとにフォームを初期状態へ戻すと、届ける通知のチェックが外れるので、戻さずに、URL と名前だけ空にする -->
			<form
				id="add-form"
				method="POST"
				action="?/add"
				use:enhance={() =>
					async ({ result, update }) => {
						await update({ reset: false });
						if (result.type === 'success') {
							newUrl = '';
							newLabel = '';
						}
					}}
				class="stack"
			>
				<input type="hidden" name="kind" value={newKind} />
				<label class="field">
					Webhook の URL
					<input
						type="url"
						name="url"
						bind:value={newUrl}
						required
						autocomplete="off"
						spellcheck="false"
						placeholder={newKind === 'discord'
							? 'https://discord.com/api/webhooks/...'
							: 'https://example.com/webhooks/funmary'}
					/>
				</label>
				<label class="field">
					名前 (任意)
					<input
						type="text"
						name="label"
						bind:value={newLabel}
						maxlength="40"
						placeholder="例: 友人と共有のサーバー"
					/>
				</label>
				<fieldset>
					<legend>届ける通知</legend>
					{#each data.kindOptions as option (option.kind)}
						<label class="check">
							<input type="checkbox" name="kinds" value={option.kind} checked />
							{option.label}
						</label>
					{/each}
				</fieldset>
				<Button type="submit" variant="unelevated"><Label>登録して、テスト通知を送る</Label></Button
				>
			</form>
		{:else}
			<p>登録できる Webhook は {data.limit} 個までで、上限に達しています。</p>
			<p>新しく登録するには、使わないものを削除してください。</p>
		{/if}
	</section>
	<p class="meta">Webhook の URL (と、汎用の Webhook の署名の鍵) は、暗号化して保存します。</p>
	<p class="meta">
		URL や鍵を知っている人は、その送り先に成りすませるので、他の人に見せないでください。
	</p>
</div>

<style lang="scss">
	@use 'mixins';

	h2 {
		margin-top: 2rem;
		font-size: 1.125rem;
	}

	.webhooks {
		@include mixins.stack(1.5rem);
		margin: 1.5rem 0 0;
		padding: 0;
		list-style: none;
	}

	.webhook {
		padding: 1rem;
		border: 1px solid var(--fm-divider);
		border-radius: 0.5rem;
	}

	.webhook h2 {
		margin-top: 0;
	}

	.notice.error {
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		background: var(--fm-surface-muted);
		overflow-wrap: anywhere;
		color: var(--fm-error);
	}

	.badge {
		margin-left: 0.5rem;
		padding: 0.125rem 0.5rem;
		border: 1px solid currentcolor;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		font-weight: normal;
	}

	.badge.kind {
		color: var(--fm-text-muted);
	}

	.meta {
		color: var(--fm-text-muted);
		font-size: 0.875rem;
		overflow-wrap: anywhere;
	}

	.key-box {
		margin: 1rem 0;
		padding: 0.75rem 1rem;
		border: 1px solid var(--fm-accent, currentcolor);
		border-radius: 0.25rem;
	}

	.key-box code {
		display: block;
		margin-top: 0.5rem;
		padding: 0.5rem;
		overflow-wrap: anywhere;
		background: var(--fm-surface-muted, rgba(128, 128, 128, 0.1));
		border-radius: 0.25rem;
	}

	.stack {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1rem;
	}

	.actions {
		@include mixins.wrap-row(0.5rem);
		margin-top: 1rem;
	}

	.field {
		@include mixins.stack(0.25rem);
		width: 100%;
	}

	.field input {
		min-height: 44px;
		padding: 0 0.75rem;
		box-sizing: border-box;
		font: inherit;
	}

	fieldset {
		@include mixins.stack(0.25rem);
		margin: 0;
		padding: 0.75rem 1rem;
		border: 1px solid var(--fm-divider);
		border-radius: 0.5rem;
	}

	.kind-choice {
		margin-bottom: 1rem;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
	}

	.steps {
		padding-left: 1.5rem;
	}
</style>
