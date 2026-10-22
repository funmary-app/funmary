<script lang="ts">
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';

	let {
		data,
		form,
	}: {
		data: {
			address: string | null;
			ipv4: string | null;
			match: { range: string; source: 'env' | 'registered'; id: string | null } | null;
			envRanges: string[];
			ranges: { id: string; range: string; label: string | null; createdAt: string }[];
		};
		form: { error?: string; message?: string } | null;
	} = $props();

	const canRegister = $derived(data.ipv4 !== null && data.match === null);
</script>

<svelte:head>
	<title>学内のネットワーク - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page page-w-48">
	<SettingsBreadcrumb current="学内のネットワーク" />
	<h1>学内のネットワーク</h1>
	<p>
		学内の Wi-Fi の IP
		アドレスの範囲です。バスの時刻表は、この範囲から開くと、未来大から出る向きをはじめに出します。
	</p>

	<FormNotice error={form?.error} message={form?.message} />

	<section aria-labelledby="current-heading">
		<h2 id="current-heading">いまの接続</h2>
		<p class="address">
			{#if data.address}
				<code>{data.ipv4 ?? data.address}</code>
			{:else}
				<span class="muted">接続元のアドレスを読めませんでした</span>
			{/if}
		</p>
		<p class="status" role="status">
			{#if data.match}
				<span class="tag registered">登録済み</span>
				{data.match.range} に入っています ({data.match.source === 'env'
					? '環境変数で設定した範囲'
					: '登録した範囲'})。
			{:else if data.address && data.ipv4 === null}
				<span class="tag">登録できません</span>
				IPv4 のアドレスではありません。
			{:else if data.address}
				<span class="tag">未登録</span>
				学内の範囲に入っていません。
			{/if}
		</p>
		<form method="POST" action="?/registerCurrent" use:enhance class="entry">
			<div class="row-actions">
				<Button type="submit" name="bits" value="32" variant="unelevated" disabled={!canRegister}>
					<Label>このアドレスだけを登録する</Label>
				</Button>
				<Button type="submit" name="bits" value="24" variant="outlined" disabled={!canRegister}>
					<Label>同じ範囲 (/24) を登録する</Label>
				</Button>
			</div>
			<p class="muted">
				学内の回線から開いているときだけ登録してください。大学以外の回線(自宅やモバイル、一般の
				Wi-Fi など)を登録すると、その回線を使う人も、学内にいる扱いになります。/24 は、256
				個のアドレスをまとめて登録します。
			</p>
		</form>
	</section>

	<section aria-labelledby="register-heading">
		<h2 id="register-heading">範囲を入力して登録する</h2>
		<form method="POST" action="?/register" use:enhance class="entry">
			<div class="field">
				<label for="range">アドレスか範囲</label>
				<input
					id="range"
					type="text"
					name="range"
					placeholder="202.231.20.0/24"
					inputmode="decimal"
					autocomplete="off"
					required
					aria-describedby="range-note"
				/>
				<p id="range-note" class="muted">
					IPv4 のアドレスか、a.b.c.d/n の範囲です。/8 より広い範囲は登録できません。
				</p>
			</div>
			<div class="field">
				<label for="label">メモ (任意)</label>
				<input id="label" type="text" name="label" maxlength="100" />
			</div>
			<Button type="submit" variant="unelevated"><Label>登録する</Label></Button>
		</form>
	</section>

	<section aria-labelledby="list-heading">
		<h2 id="list-heading">登録した範囲</h2>
		{#if data.ranges.length === 0 && data.envRanges.length === 0}
			<p>まだありません。</p>
		{:else}
			<ul class="ranges">
				{#each data.envRanges as range (range)}
					<li>
						<div class="details">
							<div class="head">
								<code>{range}</code>
								<span class="tag">環境変数</span>
							</div>
							<p class="muted">サーバーの設定 (CAMPUS_IP_RANGES) です。ここからは消せません。</p>
						</div>
					</li>
				{/each}
				{#each data.ranges as entry (entry.id)}
					<li>
						<div class="details">
							<div class="head">
								<code>{entry.range}</code>
								{#if data.match?.id === entry.id}
									<span class="tag registered">いまの接続</span>
								{/if}
							</div>
							<p class="muted">
								{entry.createdAt} に登録。{#if entry.label}{entry.label}{/if}
							</p>
						</div>
						<form method="POST" action="?/remove" use:enhance>
							<input type="hidden" name="id" value={entry.id} />
							<Button type="submit" variant="outlined"><Label>消す</Label></Button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style lang="scss">
	@use 'mixins';
	@use 'surfaces';
	@use 'text';

	section {
		margin-top: 2rem;
	}

	.address {
		margin: 0.5rem 0;
		font-size: 1.25rem;
		font-weight: 700;
	}

	.status {
		@include mixins.cluster(0.25rem 0.5rem);
		margin: 0 0 1rem;
	}

	.entry {
		@include surfaces.muted-panel;

		p {
			margin: 0;
		}
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

	.row-actions {
		@include mixins.wrap-row(0.5rem);
	}

	.ranges {
		margin: 0;
		padding: 0;
		list-style: none;

		li {
			@include mixins.cluster(0.5rem 1rem);
			justify-content: space-between;
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
		@include mixins.cluster(0.25rem 0.5rem);
	}

	.tag {
		@include text.badge;
		background: var(--fm-surface-muted);
		color: var(--fm-text-muted);
	}

	.registered {
		background: var(--fm-makeup-soft);
		color: var(--fm-makeup);
	}
</style>
