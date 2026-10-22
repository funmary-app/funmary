<script lang="ts">
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import { confirmSubmit } from '#lib/actions/confirm-submit.ts';
	import CopyField from '#lib/components/CopyField.svelte';
	import CopySnippet from '#lib/components/CopySnippet.svelte';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';
	import { createCopyState } from '#lib/clipboard.svelte.ts';
	import { buildLoginCommand, buildMcpConfig } from '#lib/token-setup.ts';

	let {
		data,
		form,
	}: {
		data: {
			tokens: readonly {
				id: number;
				name: string;
				scopes: readonly string[];
				expiresAt: string;
				createdAt: string;
				lastUsedAt: string | null;
			}[];
			scopeOptions: readonly { scope: string; label: string; write: boolean }[];
			activity: readonly { id: number; tokenName: string; summary: string; at: string }[];
			expiresOptions: readonly { days: number; label: string }[];
			origin: string;
			apiBase: string;
			docsUrl: string;
			mcpUrl: string;
		};
		form: { error?: string; message?: string; token?: string } | null;
	} = $props();

	const copyState = createCopyState();
</script>

<svelte:head>
	<title>公開 API と MCP - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<SettingsBreadcrumb current="公開 API と MCP" />
	<h1>公開 API と MCP</h1>
	<p>
		自分の AI エージェント (Claude、ChatGPT、Cursor など)
		や自作のスクリプトから、自分の時間割や休講を読めます。書き込みの範囲を許可したトークンは、予定を足す、直す、消す、通知を既読にすることもできます
		(既定ではオフです)。発行したトークンを渡した相手には、あなたの時間割の内容が伝わります。渡す相手は
		信用できるものだけにしてください。
	</p>
	<p>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Funmary の画面の経路ではなく、Hono が配る API の文書 -->
		<a href={data.docsUrl} target="_blank" rel="noopener noreferrer">API の文書 (Swagger UI)</a>
	</p>

	<FormNotice error={form?.error} message={form?.message} />

	{#if form?.token}
		<div class="key-box" role="status">
			<p>トークン (今だけ表示します。コピーしてから閉じてください。もう一度は見られません):</p>
			<CopyField id="new-token" label="トークン" value={form.token} {copyState} />
			<CopySnippet
				label="手元の MCP の設定 (Claude Desktop など。トークンが入っています)"
				value={buildMcpConfig(data.origin, form.token)}
				{copyState}
			/>
			<CopySnippet
				label="コマンド (funmary) のログイン。トークンは、尋ねられたときに貼ります"
				value={buildLoginCommand(data.origin)}
				{copyState}
			/>
		</div>
	{/if}

	<section aria-labelledby="issue-heading">
		<h2 id="issue-heading">発行する</h2>
		<form method="POST" action="?/issue" use:enhance class="entry">
			<label class="field">
				名前 (どこで使うかのメモ)
				<input
					type="text"
					name="name"
					maxlength="50"
					required
					placeholder="例: 手元の Claude Desktop"
				/>
			</label>
			<fieldset>
				<legend>読める範囲</legend>
				{#each data.scopeOptions.filter((option) => !option.write) as option (option.scope)}
					<label class="choice">
						<input type="checkbox" name="scopes" value={option.scope} />
						{option.label}
					</label>
				{/each}
			</fieldset>
			<fieldset>
				<legend>書き込める範囲</legend>
				<p class="hint">
					必要なときだけ選んでください。渡した相手が、あなたの予定を変えられるようになります。予定の公開範囲は、トークンからは変えられません。足す予定は、常に非公開です。
				</p>
				{#each data.scopeOptions.filter((option) => option.write) as option (option.scope)}
					<label class="choice">
						<input type="checkbox" name="scopes" value={option.scope} />
						{option.label}
					</label>
				{/each}
			</fieldset>
			<label class="field narrow">
				有効期限
				<select name="expiresInDays">
					{#each data.expiresOptions as option (option.days)}
						<option value={option.days} selected={option.days === 90}>{option.label}</option>
					{/each}
				</select>
			</label>
			<Button type="submit" variant="unelevated"><Label>発行する</Label></Button>
		</form>
	</section>

	<section aria-labelledby="tokens-heading">
		<h2 id="tokens-heading">発行したトークン</h2>
		{#if data.tokens.length === 0}
			<p class="muted">まだ発行していません。</p>
		{:else}
			<ul class="tokens">
				{#each data.tokens as token (token.id)}
					<li>
						<p class="name">{token.name}</p>
						<p class="meta">
							範囲: {token.scopes.join('、')} / 期限: {token.expiresAt.slice(0, 10)}
						</p>
						<p class="meta">
							発行: {token.createdAt.slice(0, 10)} / 最後に使った日: {token.lastUsedAt?.slice(
								0,
								10,
							) ?? 'まだ使われていません'}
						</p>
						<form
							method="POST"
							action="?/revoke"
							use:enhance
							use:confirmSubmit={'このトークンを無効にします。よろしいですか?'}
						>
							<input type="hidden" name="id" value={token.id} />
							<Button type="submit" variant="outlined"><Label>無効にする</Label></Button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section aria-labelledby="activity-heading">
		<h2 id="activity-heading">書き込みの履歴</h2>
		<p class="muted">
			トークンや接続から、予定や通知に書き込んだ記録です。新しい順に、最大 50 件を出します
			(記録は、最新の 200
			件まで残ります)。身に覚えのないものがあれば、そのトークンを無効にしてください。
		</p>
		{#if data.activity.length === 0}
			<p class="muted">まだ書き込みはありません。</p>
		{:else}
			<ul class="activity">
				{#each data.activity as row (row.id)}
					<li>
						<p class="name">{row.summary}</p>
						<p class="meta">{row.at} / {row.tokenName}</p>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section aria-labelledby="usage-heading">
		<h2 id="usage-heading">使い方</h2>
		<p>
			MCP (Model Context Protocol) に対応した AI アプリから、Funmary
			の時間割や通知を読ませられます。読み取りの範囲だけを許可した接続は、データを書き換えません。書き込みの範囲を許可すると、予定の追加などもでき、その記録は上の履歴に残ります。
		</p>
		<CopyField id="mcp-url" label="MCP サーバーの URL" value={data.mcpUrl} {copyState} />

		<h3>claude.ai (Web、デスクトップ、スマホ)</h3>
		<p>トークンは要りません。Funmary のアカウントで許可します。</p>
		<ol>
			<li>claude.ai の「設定」から「コネクタ」を開き、「カスタムコネクタを追加」を選ぶ</li>
			<li>名前に「Funmary」、URL に上の URL を入れて追加する</li>
			<li>
				「接続」を押すと、Funmary
				の許可の画面が開く。ログインして、読ませる範囲を選び、「許可する」を押す
			</li>
			<li>チャットで、コネクタの一覧から Funmary を有効にして、「今日の授業は?」のように聞く</li>
		</ol>
		<p>
			許可した接続は、上の一覧に「(OAuth)」付きの名前で出ます。ここで無効にすると、その接続は切れ、claude.ai
			では再び「接続」から許可し直します。アクセスの期限は 1 時間ですが、claude.ai
			が自動で更新するので、操作は要りません。
		</p>

		<h3>Claude Code など、ヘッダを付けて登録するもの</h3>
		<p>
			上でトークンを発行し、<code>Authorization: Bearer &lt;トークン&gt;</code> のヘッダとして付けて登録します。Claude
			Code なら、次のコマンドです。
		</p>
		<code class="mcp-url"
			>claude mcp add --transport http funmary {data.mcpUrl} --header "Authorization: Bearer &lt;トークン&gt;"</code
		>

		<h3>REST API</h3>
		<p>
			<code>{data.apiBase}</code> の下にあります。トークンを同じヘッダで付けて呼びます。仕様は
			<a href={data.docsUrl} target="_blank" rel="noopener noreferrer">API の文書</a>
			にあります。
		</p>
	</section>
</div>

<style lang="scss">
	@use 'forms';
	@use 'mixins';
	@use 'surfaces';
	@use 'text';

	h2 {
		margin: 2.5rem 0 1rem;
	}

	.key-box {
		@include surfaces.secret-box;
	}

	.entry {
		@include mixins.stack(1rem);
		max-width: 28rem;
	}

	.field {
		@include mixins.stack(0.25rem);
		font-size: 0.875rem;
	}

	.field.narrow {
		max-width: 12rem;
	}

	fieldset {
		@include mixins.stack(0.5rem);
		padding: 0.75rem 1rem;
		border: 1px solid var(--fm-divider);
		border-radius: 0.5rem;

		legend {
			padding: 0 0.25rem;
			font-size: 0.875rem;
			font-weight: 700;
		}
	}

	.choice {
		@include forms.choice-row(48px);
	}

	.hint {
		@include text.muted(0.8125rem);
	}

	.tokens,
	.activity {
		margin: 0;
		padding: 0;
		list-style: none;

		li {
			@include mixins.stack(0.25rem);
			padding: 1rem 0;
			border-top: 1px dashed var(--fm-divider);
		}
	}

	.name {
		margin: 0;
		font-weight: 700;
	}

	.meta {
		@include text.muted(0.8125rem);
	}

	code {
		overflow-wrap: anywhere;
	}

	.mcp-url {
		display: block;
		margin-top: 0.5rem;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		background: var(--fm-surface-muted);
		font-family: ui-monospace, monospace;
		font-size: 0.875rem;
	}
</style>
