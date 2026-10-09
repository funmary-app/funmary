<script lang="ts">
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';
	import type { DiscordAdminView, DiscordRow } from '#lib/server/discord-admin.ts';
	import type { DiscordJoinRoleSetting } from '#lib/server/discord-join-role.ts';
	import type { SupportInvite } from '#lib/server/support-invites.ts';

	let {
		data,
		form,
	}: {
		data: {
			view: DiscordAdminView;
			link: { configured: boolean; enabled: boolean };
			guildRoles: { id: string; name: string }[];
			joinRole: DiscordJoinRoleSetting;
			invites: SupportInvite[];
		};
		form: { error?: string; message?: string } | null;
	} = $props();

	let joinRoleMode = $derived(data.joinRole.mode);
</script>

{#snippet rows(kind: 'channel' | 'role', items: readonly DiscordRow[])}
	<ul class="entries">
		{#each items as item (item.name)}
			<li>
				<p class="name">
					{kind === 'channel' ? `#${item.name}` : `funmary-${item.name}`}
					<span class="label">{item.label}</span>
				</p>
				<p class="meta">
					{#if item.id}
						ID {item.id}、{item.managed ? 'Bot に任せています' : '管理者が置き換えたものです'}
					{:else}
						まだ決まっていません
					{/if}
				</p>
				<details>
					<summary>置き換える</summary>
					<form method="POST" action="?/replace" use:enhance class="replace">
						<input type="hidden" name="kind" value={kind} />
						<input type="hidden" name="name" value={item.name} />
						<label>
							既存の{kind === 'channel' ? 'チャンネル' : 'ロール'}の ID
							<input name="id" inputmode="numeric" autocomplete="off" required />
						</label>
						<Button type="submit" variant="outlined"><Label>置き換える</Label></Button>
					</form>
				</details>
				<div class="actions">
					{#if !item.managed}
						<form method="POST" action="?/useBot" use:enhance>
							<input type="hidden" name="kind" value={kind} />
							<input type="hidden" name="name" value={item.name} />
							<Button type="submit" variant="outlined"><Label>Bot に任せる</Label></Button>
						</form>
					{/if}
					{#if kind === 'channel' && item.id && data.view.botConfigured}
						<form method="POST" action="?/test" use:enhance>
							<input type="hidden" name="name" value={item.name} />
							<Button type="submit" variant="outlined"><Label>テスト送信</Label></Button>
						</form>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{/snippet}

<svelte:head>
	<title>Discord設定 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page page-w-48">
	<SettingsBreadcrumb current="Discord設定" />
	<h1>Discord設定</h1>

	<FormNotice error={form?.error} message={form?.message} />

	{#if !data.view.botConfigured}
		<p>
			Bot が設定されていません。環境変数 <code>DISCORD_BOT_TOKEN</code> と
			<code>DISCORD_GUILD_ID</code>
			を書いて、再起動すると使えます。それまでは、環境変数の Webhook (<code
				>ADMIN_DISCORD_WEBHOOK_URL</code
			>) があれば、そちらに送ります。
		</p>
	{:else}
		<p>
			ギルド (ID {data.view.guildId})
			の、カテゴリ「Funmary」の下に、通知の種類ごとの非公開のチャンネルを作ります。エラーとデプロイの失敗は、対応するロールにメンションします。ロールを自分に付けると、通知が鳴ります。
		</p>
		<p class="meta">
			Bot には「管理者」の権限を与えることを勧めます (今後の更新で Bot
			にさせることが増えても、手直しが要りません)。最低限必要なのは、チャンネルの管理、ロールの管理、チャンネルを見る、メッセージを送信です。
		</p>
		<form method="POST" action="?/ensure" use:enhance>
			<Button type="submit" variant="unelevated"><Label>チャンネルとロールを整える</Label></Button>
		</form>
	{/if}

	{#if data.view.botConfigured}
		<section aria-labelledby="presence-heading">
			<h2 id="presence-heading">オンライン表示</h2>
			<p>
				Bot
				を、メンバー一覧で「オンライン」に見せます。見た目のためだけの設定で、通知の送信には関係しません
				(切っても、通知は届きます)。本番の Funmary だけで動き、手元の開発では動きません。
			</p>
			<p class="meta">
				いまの状態: {data.view.presence.enabled ? '入れています' : '切っています'}{data.view
					.presence.available
					? ''
					: ' (この環境では動かしていません)'}
			</p>
			<form method="POST" action="?/presence" use:enhance>
				<input type="hidden" name="enabled" value={String(!data.view.presence.enabled)} />
				<Button type="submit" variant="outlined">
					<Label
						>{data.view.presence.enabled ? 'オンライン表示を切る' : 'オンライン表示を入れる'}</Label
					>
				</Button>
			</form>
		</section>
	{/if}

	{#if data.view.botConfigured}
		<section aria-labelledby="linking-heading">
			<h2 id="linking-heading">利用者の Discord 連携</h2>
			<p>
				利用者が自分の Discord
				アカウントを紐付け、休講などの通知を、サポートサーバーの本人だけの非公開スレッドか DM
				で受け取れるようにします。設定の「Discord連携」に入口が出ます。
			</p>
			{#if !data.link.configured}
				<p class="meta">
					環境変数 <code>DISCORD_CLIENT_ID</code> と <code>DISCORD_CLIENT_SECRET</code>
					が設定されていないので、有効にできません (Bot と同じ Discord Application の OAuth2 タブにあります)。
				</p>
			{:else}
				<p class="meta">いまの状態: {data.link.enabled ? '有効' : '無効'}</p>
				<form method="POST" action="?/linking" use:enhance>
					<input type="hidden" name="enabled" value={String(!data.link.enabled)} />
					<Button type="submit" variant="outlined">
						<Label>{data.link.enabled ? '連携を無効にする' : '連携を有効にする'}</Label>
					</Button>
				</form>

				<h3>参加したときに付けるロール</h3>
				<p class="meta">
					OAuth2 の連携でサーバーに参加したときに、Discord
					のロールを付けられます。登録済みの招待リンクの「参加した人に付けるロール」とは別の設定です。
				</p>
				<form method="POST" action="?/joinRole" use:enhance class="join-role">
					<fieldset>
						<legend>付け方</legend>
						<label>
							<input type="radio" name="mode" value="none" bind:group={joinRoleMode} />
							付けない
						</label>
						<label>
							<input type="radio" name="mode" value="custom" bind:group={joinRoleMode} />
							独自に選んだロールを付ける
						</label>
						<label>
							<input type="radio" name="mode" value="invite" bind:group={joinRoleMode} />
							登録済みの招待リンクと同じロールを付ける
						</label>
					</fieldset>
					{#if joinRoleMode === 'custom'}
						<fieldset>
							<legend>付けるロール</legend>
							{#each data.guildRoles as role (role.id)}
								<label>
									<input
										type="checkbox"
										name="roleIds"
										value={role.id}
										checked={data.joinRole.mode === 'custom' &&
											data.joinRole.roleIds.includes(role.id)}
									/>
									{role.name}
								</label>
							{:else}
								<p class="meta">サーバーにロールがありません。</p>
							{/each}
						</fieldset>
					{:else if joinRoleMode === 'invite'}
						<label>
							招待リンク
							<select name="inviteId" required>
								{#each data.invites as invite (invite.id)}
									<option
										value={invite.id}
										selected={data.joinRole.mode === 'invite' &&
											data.joinRole.inviteId === invite.id}
									>
										{invite.code}{invite.note ? ` (${invite.note})` : ''} — {invite.roles
											.map((r) => r.name)
											.join('、') || 'ロールなし'}
									</option>
								{:else}
									<option value="" disabled>登録済みの招待リンクがありません</option>
								{/each}
							</select>
						</label>
					{/if}
					<Button type="submit" variant="unelevated"><Label>保存する</Label></Button>
				</form>
			{/if}
		</section>
	{/if}

	<section aria-labelledby="channels-heading">
		<h2 id="channels-heading">チャンネル</h2>
		{@render rows('channel', data.view.channels)}
	</section>

	<section aria-labelledby="roles-heading">
		<h2 id="roles-heading">ロール</h2>
		{@render rows('role', data.view.roles)}
	</section>

	{#if data.view.botConfigured}
		<section aria-labelledby="grant-heading">
			<h2 id="grant-heading">ロールを付ける</h2>
			<p>
				Discord
				のユーザーに、ロールを付けたり外したりします。ユーザーは、すでにサーバーに入っている必要があります。ユーザーの
				ID は、Discord の設定で「開発者モード」を入れて、ユーザーを右クリックし、「ユーザー ID
				をコピー」で得られます。
			</p>
			<form method="POST" action="?/role" use:enhance class="grant">
				<label>
					Discord のユーザーの ID
					<input name="userId" inputmode="numeric" autocomplete="off" required />
				</label>
				<label>
					ロール
					<select name="name" required>
						{#each data.view.roles.filter((role) => role.id) as role (role.name)}
							<option value={role.name}>funmary-{role.name} ({role.label})</option>
						{:else}
							<option value="" disabled>先にロールを整えてください</option>
						{/each}
					</select>
				</label>
				<div class="actions">
					<Button type="submit" name="action" value="add" variant="unelevated">
						<Label>付ける</Label>
					</Button>
					<Button type="submit" name="action" value="remove" variant="outlined">
						<Label>外す</Label>
					</Button>
				</div>
			</form>
		</section>
	{/if}
</div>

<style lang="scss">
	@use 'mixins';

	section {
		margin-top: 2rem;
	}
	.entries {
		padding: 0;
		list-style: none;
	}
	.entries > li {
		margin: 0.75rem 0;
		padding: 0.75rem 1rem;
		border: 1px solid var(--fm-divider);
		border-radius: 0.5rem;
	}
	.name {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 500;
	}
	.label {
		margin-left: 0.5rem;
		color: var(--fm-text-muted);
		font-size: 0.875rem;
		font-weight: 400;
	}
	.meta {
		margin: 0;
		color: var(--fm-text-muted);
		font-size: 0.875rem;
	}
	summary {
		min-height: 44px;
		align-content: center;
		cursor: pointer;
	}
	.replace {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.5rem 1rem;

		label {
			@include mixins.stack(0.25rem);
			font-size: 0.875rem;
		}
	}
	.grant {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.5rem 1rem;

		label {
			@include mixins.stack(0.25rem);
			font-size: 0.875rem;
		}
	}
	.join-role {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1rem;
		margin-top: 0.75rem;
	}
	.join-role fieldset {
		@include mixins.stack(0.5rem);
		margin: 0;
		padding: 0.75rem 1rem;
		border: 1px solid var(--fm-divider);
		border-radius: 0.5rem;
	}
	.join-role fieldset label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
	}
	.join-role > label {
		@include mixins.stack(0.25rem);
		font-size: 0.875rem;
	}
	.actions {
		@include mixins.wrap-row(0.5rem);
	}
</style>
