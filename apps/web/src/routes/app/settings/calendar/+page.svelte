<script lang="ts">
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { confirmSubmit } from '#lib/actions/confirm-submit.ts';
	import { createCopyState } from '#lib/clipboard.svelte.ts';
	import CopyField from '#lib/components/CopyField.svelte';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';

	let {
		data,
		form,
	}: {
		data: {
			subscription: { createdAt: string; lastUsedAt: string | null } | null;
		};
		form: {
			message?: string;
			issued?: {
				url: string;
				webcal: string;
				google: string;
				qr: { size: number; path: string };
			};
		} | null;
	} = $props();

	const copyState = createCopyState();
</script>

<svelte:head>
	<title>カレンダーの購読 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<SettingsBreadcrumb current="カレンダーの購読" />
	<h1>カレンダーの購読</h1>
	<p>
		履修科目の授業を、Google カレンダーや iPhone
		のカレンダーなど、ふだん使っているカレンダーに入れられます。休講、補講、教室変更も反映されます。
	</p>
	<ul class="notes">
		<li>
			載るのは、2
			週間前から半年先までの授業と、振替授業日、全学の休講日です。履修科目を変えると、カレンダーにも反映されます。
		</li>

		<li>
			カレンダーアプリが予定を取りに来る間隔はアプリ次第で、Google カレンダーでは数時間から 1
			日かかります。当日の休講は、
			<a href={resolve('app')}>今日</a>
			の画面で確かめてください。
		</li>
	</ul>

	<FormNotice message={form?.message} />

	{#if form?.issued}
		{@const issued = form.issued}
		<section class="issued" aria-labelledby="issued-heading">
			<h2 id="issued-heading">購読の URL を発行しました</h2>
			<p>
				この画面を離れると、もう出せません。いまのうちに、カレンダーアプリに登録してください。URL
				を知っている人は誰でもあなたの時間割を見られるので、人に教えないでください。
			</p>

			<h3>カレンダーに追加する</h3>
			<div class="add-links">
				<Button href={issued.google} target="_blank" rel="noopener noreferrer" variant="unelevated">
					<Label>Google カレンダーに追加</Label>
				</Button>
				<!-- webcal: はカレンダーアプリを開くだけなので、新しいタブにしない (空のタブが残るため) -->
				<Button href={issued.webcal} variant="outlined">
					<Label>iPhone や Mac のカレンダーに追加</Label>
				</Button>
			</div>

			<p class="muted">
				Google カレンダーのスマホのアプリからは追加できません。PC のブラウザで開くか、下の URL を PC
				の Google カレンダーの「他のカレンダー」の「URL で追加」に貼ってください。
			</p>

			<CopyField id="calendar-url" label="購読の URL" value={issued.url} {copyState} />

			<p class="muted" role="status">{copyState.copied ? 'コピーしました。' : ''}</p>

			<div class="qr">
				<svg
					viewBox="0 0 {issued.qr.size} {issued.qr.size}"
					role="img"
					aria-label="購読の URL の QR コード"
					shape-rendering="crispEdges"
				>
					<rect width={issued.qr.size} height={issued.qr.size} fill="#fff"></rect>

					<path d={issued.qr.path} fill="#000"></path>
				</svg>
				<p class="muted">
					PC で開いているときは、スマホのカメラでこの QR コードを読むと、スマホで URL を開けます。
				</p>
			</div>
		</section>
	{/if}

	{#if data.subscription}
		<section aria-labelledby="status-heading">
			<h2 id="status-heading">購読の状態</h2>
			<dl class="status">
				<dt>発行した日時</dt>
				<dd>{data.subscription.createdAt}</dd>
				<dt>カレンダーアプリが最後に取りに来た日時</dt>
				<dd>{data.subscription.lastUsedAt ?? 'まだ取りに来ていません'}</dd>
			</dl>
			<p class="muted">
				安全のため、URL はもう一度出せません。別の端末に登録したいときや、URL
				を人に知られたときは、再発行してください。再発行すると前の URL は使えなくなるので、前の URL
				で登録したカレンダーはアプリから消してください。
			</p>
			<div class="actions">
				<form
					method="POST"
					action="?/issue"
					use:enhance={() => {
						copyState.reset();
					}}
				>
					<Button type="submit" variant="unelevated"><Label>再発行する</Label></Button>
				</form>
				<form
					method="POST"
					action="?/revoke"
					use:confirmSubmit={'この購読の URL を無効にします。登録したカレンダーアプリで、予定が見えなくなります。よろしいですか?'}
					use:enhance
				>
					<Button type="submit" variant="outlined"><Label>無効にする</Label></Button>
				</form>
			</div>
		</section>
	{:else}
		<section aria-labelledby="issue-heading">
			<h2 id="issue-heading">購読の URL を発行する</h2>
			<p class="muted">発行した URL を、カレンダーアプリに登録します。</p>
			<form
				method="POST"
				action="?/issue"
				use:enhance={() => {
					copyState.reset();
				}}
			>
				<Button type="submit" variant="unelevated"><Label>購読の URL を発行する</Label></Button>
			</form>
		</section>
	{/if}
</div>

<style lang="scss">
	@use 'mixins';

	section {
		margin-top: 2rem;
	}

	.notes {
		padding-left: 1.25rem;
		color: var(--fm-text-muted);
		font-size: 0.875rem;

		li + li {
			margin-top: 0.25rem;
		}
	}

	.issued {
		padding: 1rem 1.25rem;
		border-radius: 0.75rem;
		background: var(--fm-primary-soft);

		h2 {
			margin-top: 0;
		}

		h3 {
			margin-bottom: 0.5rem;
			font-size: 1rem;
		}
	}

	.add-links,
	.actions {
		@include mixins.wrap-row(0.5rem);
	}

	.qr {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;

		svg {
			width: 10rem;
			height: 10rem;
			border-radius: 0.5rem;
		}

		p {
			flex: 1 1 12rem;
		}
	}

	/* スマホの幅でも日時が折り返さないよう、項目名の下に値を置く */
	.status {
		margin: 0;

		dt {
			color: var(--fm-text-muted);
			font-size: 0.875rem;
		}

		dd {
			margin: 0 0 0.5rem;
		}
	}
</style>
