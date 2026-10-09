<script lang="ts">
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import { confirmSubmit } from '#lib/actions/confirm-submit.ts';
	import { DAILY_DIGEST_STEP_MINUTES, type DailyDigestSettings } from '@funmary/core';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';

	type Destination = 'thread' | 'dm' | 'both';

	let {
		data,
		form,
	}: {
		data: {
			configured: boolean;
			enabled: boolean;
			linked: { hasThread: boolean; hasDm: boolean } | null;
			/** 予定のまとめの設定。連携していなければ null */
			digest: DailyDigestSettings | null;
			/** 届ける通知の種類 (休講など)。連携していなければ null */
			kinds: string[] | null;
			kindOptions: readonly { kind: string; label: string }[];
			/** 種類ごとの送り先とメンション。連携していなければ null */
			routing: { kind: string; label: string; destination: Destination; mention: boolean }[] | null;
			callback: { ok: boolean; message: string } | null;
			/** 管理者が公開にした、サポートサーバーへの招待。なければ null */
			supportInvite: { url: string } | null;
		};
		form: { error?: string; message?: string } | null;
	} = $props();

	const pad = (value: number) => String(value).padStart(2, '0');
	const HOURS = Array.from({ length: 24 }, (_, hour) => pad(hour));
	const MINUTES = Array.from({ length: 60 / DAILY_DIGEST_STEP_MINUTES }, (_, index) =>
		pad(index * DAILY_DIGEST_STEP_MINUTES),
	);

	let initialDestination = $state<'thread' | 'dm'>('thread');
	// 保存すると data が読み直されるので、保存した値に戻る
	let timing = $derived(data.digest?.timing ?? 'evening');

	let bulkDestination = $state<Destination>('thread');
	let bulkMention = $state(false);
</script>

<svelte:head>
	<title>Discord連携 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page page-w-40">
	<SettingsBreadcrumb current="Discord連携" />
	<h1>Discord連携</h1>
	{#if data.supportInvite}
		<p>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Discord の招待 (外部のサイト) -->
			<a href={data.supportInvite.url} target="_blank" rel="noopener noreferrer"
				>Discord のサポートサーバー</a
			>に、招待リンクから参加できます。
		</p>
	{/if}

	{#if data.callback}
		<p class={data.callback.ok ? 'message' : 'error'} role={data.callback.ok ? 'status' : 'alert'}>
			{data.callback.message}
		</p>
	{/if}
	<FormNotice error={form?.error} message={form?.message} />

	{#if !data.configured}
		<p>いまは Discord 連携を使えません。</p>
	{:else if !data.enabled}
		<p>いまは、管理者が Discord 連携を無効にしています。</p>
	{:else if data.linked}
		<p>
			Discord と連携しています。下の「通知の送り先」で、種類ごとに非公開スレッドか DM (または両方)
			を選べます。
		</p>
		<p class="meta">
			別の Discord アカウントに付け替えたいときは、いったん解除してから、もう一度連携してください。
		</p>
		<form
			method="POST"
			action="?/unlink"
			use:enhance
			use:confirmSubmit={'Discord との連携を解除します。よろしいですか?'}
		>
			<Button type="submit" variant="outlined"><Label>連携を解除する</Label></Button>
		</form>

		<section aria-labelledby="thread-heading">
			<h2 id="thread-heading">スレッドの管理</h2>
			{#if !data.linked.hasThread}
				<p class="meta">
					まだ非公開スレッドがありません。下の「通知の送り先」でスレッドを使う設定にすると、自動で作られます。「作り直す」でも、いますぐ作れます。
				</p>
			{/if}
			<div class="thread-actions">
				<form method="POST" action="?/archiveThread" use:enhance>
					<Button type="submit" variant="outlined" disabled={!data.linked.hasThread}>
						<Label>アーカイブする</Label>
					</Button>
				</form>
				<form
					method="POST"
					action="?/recreateThread"
					use:enhance
					use:confirmSubmit={data.linked.hasThread
						? 'いまのスレッドを削除して、新しいスレッドを作ります。よろしいですか?'
						: '新しいスレッドを作ります。よろしいですか?'}
				>
					<Button type="submit" variant="outlined"><Label>作り直す</Label></Button>
				</form>
				<form
					method="POST"
					action="?/deleteThread"
					use:enhance
					use:confirmSubmit={'スレッドを完全に削除します。元には戻せません。よろしいですか?'}
				>
					<Button type="submit" variant="outlined" disabled={!data.linked.hasThread}>
						<Label>削除する</Label>
					</Button>
				</form>
			</div>
		</section>

		{#if data.routing}
			<section aria-labelledby="routing-heading">
				<h2 id="routing-heading">通知の送り先</h2>
				<p>
					通知の種類ごとに、送り先 (非公開スレッド、DM、または両方) と、メンションするかを選べます。
				</p>

				<h3>まとめて適用する</h3>
				<form method="POST" action="?/routingAll" use:enhance class="link-form">
					<fieldset>
						<legend>送り先</legend>
						<label>
							<input type="radio" name="destination" value="thread" bind:group={bulkDestination} />
							非公開スレッド
						</label>
						<label>
							<input type="radio" name="destination" value="dm" bind:group={bulkDestination} />
							DM
						</label>
						<label>
							<input type="radio" name="destination" value="both" bind:group={bulkDestination} />
							両方
						</label>
					</fieldset>
					<label>
						<input type="checkbox" name="mention" bind:checked={bulkMention} />
						メンションする
					</label>
					<Button type="submit" variant="outlined"><Label>すべての種類に適用する</Label></Button>
				</form>

				<h3>種類ごとの設定</h3>
				<form
					method="POST"
					action="?/routing"
					use:enhance={() =>
						({ update }) =>
							update({ reset: false })}
					class="link-form"
				>
					{#each data.routing as row (row.kind)}
						<fieldset>
							<legend>{row.label}</legend>
							<label>
								<input
									type="radio"
									name="destination_{row.kind}"
									value="thread"
									checked={row.destination === 'thread'}
								/>
								非公開スレッド
							</label>
							<label>
								<input
									type="radio"
									name="destination_{row.kind}"
									value="dm"
									checked={row.destination === 'dm'}
								/>
								DM
							</label>
							<label>
								<input
									type="radio"
									name="destination_{row.kind}"
									value="both"
									checked={row.destination === 'both'}
								/>
								両方
							</label>
							<label>
								<input type="checkbox" name="mention_{row.kind}" checked={row.mention} />
								メンションする
							</label>
						</fieldset>
					{/each}
					<Button type="submit" variant="unelevated"><Label>保存する</Label></Button>
				</form>
			</section>
		{/if}

		{#if data.kinds}
			<section aria-labelledby="kinds-heading">
				<h2 id="kinds-heading">届ける通知</h2>
				<p>上の送り先に届ける、通知の種類です。</p>
				<form
					method="POST"
					action="?/kinds"
					use:enhance={() =>
						({ update }) =>
							update({ reset: false })}
					class="link-form"
				>
					<fieldset>
						<legend>届ける通知の種類</legend>
						{#each data.kindOptions as option (option.kind)}
							<label>
								<input
									type="checkbox"
									name="kinds"
									value={option.kind}
									checked={data.kinds.includes(option.kind)}
								/>
								{option.label}
							</label>
						{/each}
					</fieldset>
					<Button type="submit" variant="unelevated"><Label>保存する</Label></Button>
				</form>
			</section>
		{/if}

		{#if data.digest}
			<section aria-labelledby="digest-heading">
				<h2 id="digest-heading">予定のまとめ</h2>
				<p>
					今日か明日の授業 (休講、補講、教室変更を含む) と予定を、1 日に 1
					回、上の送り先に届けます。メンションはしません。
				</p>
				<!-- 保存した値が欄に残るよう、送信のあとにフォームを初期状態へ戻さない -->
				<form
					method="POST"
					action="?/digest"
					use:enhance={() =>
						({ update }) =>
							update({ reset: false })}
					class="link-form"
				>
					<label>
						<input type="checkbox" name="enabled" checked={data.digest.enabled} />
						予定のまとめを受け取る
					</label>
					<fieldset>
						<legend>届ける時刻</legend>
						<label>
							<input type="radio" name="timing" value="evening" bind:group={timing} />
							前日の 20:30 に、明日の予定を届ける
						</label>
						<label>
							<input type="radio" name="timing" value="morning" bind:group={timing} />
							当日の 06:30 に、今日の予定を届ける
						</label>
						<label>
							<input type="radio" name="timing" value="custom" bind:group={timing} />
							時刻を選ぶ
						</label>
						<div class="custom">
							<label>
								時
								<select
									name="customHour"
									value={data.digest.customTime.slice(0, 2)}
									disabled={timing !== 'custom'}
								>
									{#each HOURS as hour (hour)}<option value={hour}>{Number(hour)}</option>{/each}
								</select>
							</label>
							<label>
								分
								<select
									name="customMinute"
									value={data.digest.customTime.slice(3, 5)}
									disabled={timing !== 'custom'}
								>
									{#each MINUTES as minute (minute)}<option value={minute}>{minute}</option>{/each}
								</select>
							</label>
							<label>
								届ける予定
								<select
									name="customDay"
									value={data.digest.customDay}
									disabled={timing !== 'custom'}
								>
									<option value="today">その日の予定</option>
									<option value="tomorrow">翌日の予定</option>
								</select>
							</label>
						</div>
					</fieldset>
					<label>
						<input type="checkbox" name="sendWhenEmpty" checked={data.digest.sendWhenEmpty} />
						授業も予定もない日にも、「予定はありません」と届ける
					</label>
					<Button type="submit" variant="unelevated"><Label>保存する</Label></Button>
				</form>
			</section>
		{/if}
	{:else}
		<p>
			Discord のアカウントを紐付け、休講などの通知を、Funmary
			のサポートサーバーの非公開スレッドか、DM
			で受け取れるようにします。連携したあとに、通知の種類ごとの送り先も選べます。
		</p>
		<form method="POST" action="?/link" use:enhance class="link-form">
			<fieldset>
				<legend>はじめの送り先</legend>
				<label>
					<input type="radio" name="destination" value="thread" bind:group={initialDestination} />
					サポートサーバーの、あなただけの非公開スレッド
				</label>
				<label>
					<input type="radio" name="destination" value="dm" bind:group={initialDestination} />
					あなたへの DM (サーバーのメンバーからの DM を許可している必要があります)
				</label>
			</fieldset>
			<Button type="submit" variant="unelevated"><Label>Discord と連携する</Label></Button>
		</form>
	{/if}
</div>

<style lang="scss">
	@use 'mixins';

	.meta {
		color: var(--fm-text-muted);
		font-size: 0.875rem;
	}

	.link-form {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1rem;
	}

	fieldset {
		@include mixins.stack(0.5rem);
		margin: 0;
		padding: 0.75rem 1rem;
		border: 1px solid var(--fm-divider);
		border-radius: 0.5rem;
	}

	h2 {
		margin-top: 2rem;
	}

	h3 {
		margin-top: 1.25rem;
		font-size: 1rem;
	}

	.thread-actions {
		@include mixins.wrap-row(0.5rem);
	}

	.custom {
		@include mixins.wrap-row(0.5rem 1.5rem);
		padding-left: 1.75rem;
	}

	label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
	}
</style>
