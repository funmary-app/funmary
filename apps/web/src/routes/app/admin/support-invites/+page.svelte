<script lang="ts">
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';

	interface InviteRow {
		id: string;
		url: string;
		source: 'bot' | 'manual';
		public: boolean;
		roles: string[];
		note: string | null;
		maxUses: number;
		createdAt: string;
		expiresAt: string | null;
		state: 'active' | 'expired' | 'revoked';
	}

	let {
		data,
		form,
	}: {
		data: {
			botConfigured: boolean;
			discordError: string | null;
			channels: { id: string; name: string }[];
			roles: { id: string; name: string }[];
			invites: InviteRow[];
		};
		form: { error?: string; message?: string } | null;
	} = $props();

	const STATE_LABELS = { active: '使える', expired: '期限切れ', revoked: '取り消し済み' } as const;
	const DAYS = [0, 1, 2, 3, 4, 5, 6, 7];

	const activeInvites = $derived(data.invites.filter((invite) => invite.state === 'active'));
	const pastInvites = $derived(data.invites.filter((invite) => invite.state !== 'active'));
</script>

<svelte:head>
	<title>サポートサーバーの招待 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page page-w-48">
	<SettingsBreadcrumb current="サポートサーバーの招待" />
	<h1>サポートサーバーの招待</h1>
	<p>
		Discord
		のサポートサーバーへの招待リンクを発行、登録します。公開にした招待のうち、いちばん新しいものを、「このアプリについて」と
		Discord 連携の画面に出します。
	</p>

	<FormNotice error={form?.error} message={form?.message} />

	<section aria-labelledby="issue-heading">
		<h2 id="issue-heading">Bot で発行する</h2>
		{#if !data.botConfigured}
			<p class="muted">
				Discord の Bot (DISCORD_BOT_TOKEN と DISCORD_GUILD_ID) を設定すると、ここから発行できます。
			</p>
		{:else if data.discordError}
			<FormNotice error={data.discordError} />
		{:else}
			<form method="POST" action="?/issue" use:enhance class="entry">
				<div class="field">
					<label for="channel">招待するチャンネル</label>
					<select id="channel" name="channelId" required>
						{#each data.channels as channel (channel.id)}
							<option value={channel.id}>#{channel.name}</option>
						{/each}
					</select>
				</div>
				<div class="field">
					<label for="days">期限</label>
					<select id="days" name="days">
						{#each DAYS as day (day)}
							<option value={String(day)}>{day === 0 ? '無期限' : `${day} 日`}</option>
						{/each}
					</select>
				</div>
				<div class="field">
					<label for="max-uses">使える回数 (0 は制限なし)</label>
					<input id="max-uses" type="number" name="maxUses" min="0" max="100" value="0" required />
				</div>
				{#if data.roles.length > 0}
					<fieldset>
						<legend>参加した人に付けるロール</legend>
						<p class="muted">
							Bot に「ロールの管理」の権限が要ります。Bot
							より上のロールは付けられません。付いたロールは、招待を消しても残ります。
						</p>
						{#each data.roles as role (role.id)}
							<label class="choice">
								<input type="checkbox" name="roleIds" value={role.id} />
								<span>{role.name}</span>
							</label>
						{/each}
					</fieldset>
				{/if}
				<label class="choice">
					<input type="checkbox" name="public" />
					<span>公開する</span>
				</label>
				<div class="field">
					<label for="issue-note">メモ (任意)</label>
					<input id="issue-note" type="text" name="note" maxlength="100" />
				</div>
				<Button type="submit" variant="unelevated"><Label>発行する</Label></Button>
			</form>
		{/if}
	</section>

	<section aria-labelledby="register-heading">
		<h2 id="register-heading">自分で作った招待を登録する</h2>
		<form method="POST" action="?/register" use:enhance class="entry">
			<div class="field">
				<label for="url">招待の URL</label>
				<input
					id="url"
					type="url"
					name="url"
					placeholder="https://discord.gg/..."
					required
					aria-describedby="url-note"
				/>
				<p id="url-note" class="muted">
					期限、回数、ロールは、Discord で作ったときの設定のままです。取り消しても、Discord
					の招待そのものは残ります。
				</p>
			</div>
			<label class="choice">
				<input type="checkbox" name="public" />
				<span>公開する</span>
			</label>
			<div class="field">
				<label for="register-note">メモ (任意)</label>
				<input id="register-note" type="text" name="note" maxlength="100" />
			</div>
			<Button type="submit" variant="unelevated"><Label>登録する</Label></Button>
		</form>
	</section>

	<section aria-labelledby="list-heading">
		<h2 id="list-heading">使える招待</h2>
		{#if activeInvites.length === 0}
			<p>まだありません。</p>
		{:else}
			<ul class="invites">
				{#each activeInvites as invite (invite.id)}
					<li>
						{@render details(invite)}
						<div class="row-actions">
							<form method="POST" action="?/setPublic" use:enhance>
								<input type="hidden" name="id" value={invite.id} />
								<input type="hidden" name="public" value={String(!invite.public)} />
								<Button type="submit" variant="outlined">
									<Label>{invite.public ? '非公開にする' : '公開する'}</Label>
								</Button>
							</form>
							<form method="POST" action="?/revoke" use:enhance>
								<input type="hidden" name="id" value={invite.id} />
								<Button type="submit" variant="outlined"><Label>取り消す</Label></Button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if pastInvites.length > 0}
		<section aria-labelledby="past-heading">
			<h2 id="past-heading">使えなくなった招待</h2>
			<ul class="invites">
				{#each pastInvites as invite (invite.id)}
					<li>{@render details(invite)}</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

{#snippet details(invite: InviteRow)}
	<div class="details">
		<div class="head">
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Discord の招待 (外部のサイト) -->
			<a href={invite.url} target="_blank" rel="noopener noreferrer" class="url">{invite.url}</a>
			<span class={['state', invite.state]}>{STATE_LABELS[invite.state]}</span>
			{#if invite.state === 'active'}
				<span class="tag">{invite.public ? '公開' : '非公開'}</span>
			{/if}
		</div>
		<p class="muted">
			{invite.source === 'bot' ? 'Bot で発行' : '自分で登録'}、{invite.createdAt}。
			{#if invite.source === 'bot'}
				期限 {invite.expiresAt ?? 'なし'}、回数 {invite.maxUses === 0
					? '制限なし'
					: `${invite.maxUses} 回`}。
			{/if}
			{#if invite.roles.length > 0}ロール: {invite.roles.join('、')}。{/if}
			{#if invite.note}{invite.note}{/if}
		</p>
	</div>
{/snippet}

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

	.field {
		@include mixins.stack(0.25rem);
		width: 100%;
		max-width: 24rem;
		font-size: 0.875rem;

		p {
			margin: 0;
		}
	}

	fieldset {
		display: grid;
		gap: 0.25rem;
		margin: 0;
		padding: 0;
		border: 0;

		p {
			margin: 0 0 0.25rem;
		}
	}

	legend {
		margin-bottom: 0.25rem;
		font-size: 0.875rem;
	}

	.choice {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
	}

	.invites {
		margin: 0;
		padding: 0;
		list-style: none;

		li {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			justify-content: space-between;
			gap: 0.5rem 1rem;
			padding: 0.75rem 0;
			border-bottom: 1px dashed var(--fm-divider);
		}
	}

	.details {
		min-width: 0;

		p {
			margin: 0.25rem 0 0;
		}
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.5rem;
	}

	.url {
		overflow-wrap: anywhere;
	}

	.row-actions {
		@include mixins.wrap-row(0.5rem);

		/* 文言が変わっても、ボタンの幅と位置を変えない */
		:global(button) {
			min-width: 8rem;
		}
	}

	.state,
	.tag {
		display: inline-block;
		padding: 0 0.5rem;
		border-radius: 0.375rem;
		font-size: 0.8125rem;
		font-weight: 700;
		white-space: nowrap;
	}

	.tag {
		background: var(--fm-surface-muted);
		color: var(--fm-text-muted);
	}

	.active {
		background: var(--fm-makeup-soft);
		color: var(--fm-makeup);
	}

	.expired,
	.revoked {
		background: var(--fm-surface-muted);
		color: var(--fm-text-muted);
	}
</style>
