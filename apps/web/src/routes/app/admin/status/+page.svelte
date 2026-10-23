<script lang="ts">
	import DataTable, { Body, Cell, Head, Row } from '@smui/data-table';
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import type { ResponseTimeSummary } from '#lib/server/response-times.ts';
	import type { SourceStatusRow } from '#lib/server/source-status.ts';
	import { SOURCE_STATE_LABELS } from '#lib/source-label.ts';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';

	interface RunRow {
		id: number;
		job: string;
		startedAt: string;
		seconds: number | null;
		status: 'running' | 'succeeded' | 'failed' | 'skipped';
		message: string | null;
	}

	interface FailedDeliveryRow {
		id: number;
		attempts: number;
		userEmail: string;
		channelKind: string;
		notificationKind: string;
		title: string;
		lastError: string | null;
		failedAt: string | null;
	}

	let {
		data,
		form,
	}: {
		data: {
			sources: SourceStatusRow[];
			jobs: { name: string; label: string }[];
			runs: RunRow[];
			failedDeliveries: FailedDeliveryRow[];
			responseTimes: ResponseTimeSummary;
		};
		form: { error?: string; message?: string } | null;
	} = $props();

	/** 動かしている定期処理の名前。終わるまで、ほかのボタンも押せなくする */
	let runningJob = $state<string | null>(null);

	const percent = (value: number | null) => (value === null ? '-' : `${Math.round(value * 100)}%`);
	const quantile = (value: number | null) => (value === null ? '2500 ms 超' : `${value} ms 以内`);
	const maxBucket = $derived(
		Math.max(1, ...data.responseTimes.buckets.map((bucket) => bucket.count)),
	);

	const RUN_LABELS = {
		running: '実行中',
		succeeded: '成功',
		failed: '失敗',
		skipped: '見送り',
	} as const;
</script>

<svelte:head>
	<title>取得元と実行履歴 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page page-w-56">
	<SettingsBreadcrumb current="取得元と実行履歴" />
	<h1>取得元と実行履歴</h1>

	<FormNotice error={form?.error} message={form?.message} />

	<section aria-labelledby="sources-heading">
		<h2 id="sources-heading">取得元の状態</h2>
		<p class="muted">
			3 回続けて失敗すると「不調」になり、次に試すまでの間隔が延びます。時刻は日本時間です。
		</p>
		<ul class="sources">
			{#each data.sources as source (source.source)}
				<li>
					<div class="source-head">
						<h3>{source.label}</h3>
						<span class={['state', source.state]}>{SOURCE_STATE_LABELS[source.state]}</span>
					</div>
					{#if source.state !== 'never'}
						<dl>
							<dt>最終成功</dt>
							<dd class="numeric">{source.lastSuccessAt ?? 'なし'}</dd>
							<dt>最終試行</dt>
							<dd class="numeric">{source.lastAttemptAt ?? 'なし'}</dd>
							<dt>連続の失敗</dt>
							<dd class="numeric">{source.consecutiveFailures} 回</dd>
							{#if source.nextAttemptAt}
								<dt>次の試行</dt>
								<dd class="numeric">{source.nextAttemptAt}</dd>
							{/if}
							{#if source.lastError}
								<dt>直近の失敗</dt>
								<dd class="error-text">{source.lastError}</dd>
							{/if}
						</dl>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	<section aria-labelledby="run-now-heading">
		<h2 id="run-now-heading">今すぐ動かす</h2>
		<p class="muted">
			定期処理を、決まった時刻を待たずに 1
			回動かします。終わるまで待ちます。学生ポータルからの取得は、前の取得から 60
			分たっていなければ、取得せずに終わります。
		</p>
		<ul class="jobs">
			{#each data.jobs as job (job.name)}
				<li>
					<form
						method="POST"
						action="?/runJob"
						use:enhance={() => {
							runningJob = job.name;
							return async ({ update }) => {
								await update();
								runningJob = null;
							};
						}}
					>
						<input type="hidden" name="job" value={job.name} />
						<span>{job.label}</span>
						<!-- 動いている間も、ボタンの文言と大きさは変えない -->
						<Button
							type="submit"
							variant="outlined"
							disabled={runningJob !== null}
							aria-busy={runningJob === job.name}
						>
							<Label>動かす</Label>
						</Button>
					</form>
				</li>
			{/each}
		</ul>
		<p class="muted" aria-live="polite">
			{runningJob
				? `${data.jobs.find((job) => job.name === runningJob)?.label ?? ''} を動かしています`
				: ''}
		</p>
	</section>

	<section aria-labelledby="runs-heading">
		<h2 id="runs-heading">定期処理の実行履歴</h2>
		{#if data.runs.length === 0}
			<p>まだ記録がありません。</p>
		{:else}
			<DataTable>
				<Head>
					<Row>
						<Cell>始まり</Cell>
						<Cell>処理</Cell>
						<Cell>結果</Cell>
						<Cell>かかった時間</Cell>
					</Row>
				</Head>
				<Body>
					{#each data.runs as run (run.id)}
						<Row>
							<Cell class="numeric">{run.startedAt}</Cell>
							<Cell>{run.job}</Cell>
							<Cell>
								<span class={['run', run.status]}>{RUN_LABELS[run.status]}</span>
								{#if run.message}<span class="message">{run.message}</span>{/if}
							</Cell>
							<Cell class="numeric">{run.seconds === null ? '-' : `${run.seconds} 秒`}</Cell>
						</Row>
					{/each}
				</Body>
			</DataTable>
		{/if}
	</section>

	<section aria-labelledby="failed-deliveries-heading">
		<h2 id="failed-deliveries-heading">配信の失敗</h2>
		<p class="muted">
			利用者のチャネル (Discord の Webhook、汎用の Webhook、Discord 連携)
			へ通知を送り、尽きるまで再送しても届かなかったものです。新しい順に出します。
		</p>
		{#if data.failedDeliveries.length === 0}
			<p>まだ記録がありません。</p>
		{:else}
			<DataTable>
				<Head>
					<Row>
						<Cell>失敗の時刻</Cell>
						<Cell>利用者</Cell>
						<Cell>送り先</Cell>
						<Cell>通知</Cell>
						<Cell>試した回数</Cell>
						<Cell>理由</Cell>
					</Row>
				</Head>
				<Body>
					{#each data.failedDeliveries as delivery (delivery.id)}
						<Row>
							<Cell class="numeric">{delivery.failedAt ?? '-'}</Cell>
							<Cell>{delivery.userEmail}</Cell>
							<Cell>{delivery.channelKind}</Cell>
							<Cell>
								<span class="badge">{delivery.notificationKind}</span>
								{delivery.title}
							</Cell>
							<Cell class="numeric">{delivery.attempts} 回</Cell>
							<Cell><span class="error-text">{delivery.lastError ?? '-'}</span></Cell>
						</Row>
					{/each}
				</Body>
			</DataTable>
		{/if}
	</section>

	<section aria-labelledby="response-heading">
		<h2 id="response-heading">応答時間 (直近 24 時間)</h2>
		<p class="muted">
			画面と API の、サーバーの中の処理時間です。目標は 95% が 100 ms
			以内です。サーバーのメモリにだけ記録するので、再起動すると消えます。
		</p>
		{#if data.responseTimes.count === 0}
			<p>まだ記録がありません。</p>
		{:else}
			<dl>
				<dt>件数</dt>
				<dd class="numeric">{data.responseTimes.count} 件</dd>
				<dt>100 ms 以内</dt>
				<dd class="numeric">{percent(data.responseTimes.withinTarget)}</dd>
				<dt>50% の応答</dt>
				<dd class="numeric">{quantile(data.responseTimes.p50)}</dd>
				<dt>95% の応答</dt>
				<dd class="numeric">{quantile(data.responseTimes.p95)}</dd>
				<dt>99% の応答</dt>
				<dd class="numeric">{quantile(data.responseTimes.p99)}</dd>
			</dl>
			<DataTable class="histogram">
				<caption class="visually-hidden">応答時間の分布</caption>
				<Head>
					<Row>
						<Cell>応答時間</Cell>
						<Cell>件数</Cell>
						<Cell><span class="visually-hidden">割合</span></Cell>
					</Row>
				</Head>
				<Body>
					{#each data.responseTimes.buckets as bucket (bucket.upTo)}
						<Row>
							<Cell class="numeric"
								>{bucket.upTo === null ? '2500 ms 超' : `${bucket.upTo} ms 以内`}</Cell
							>
							<Cell class="numeric">{bucket.count}</Cell>
							<Cell class="bar-cell">
								<span class="bar" style:inline-size={`${(bucket.count / maxBucket) * 100}%`}></span>
							</Cell>
						</Row>
					{/each}
				</Body>
			</DataTable>
		{/if}
	</section>
</div>

<style lang="scss">
	@use 'mixins';
	@use 'text';

	.sources {
		margin: 0;
		padding: 0;
		list-style: none;

		li {
			padding: 0.75rem 0;
			border-bottom: 1px dashed var(--fm-divider);
		}
	}

	.source-head {
		@include mixins.cluster(0.25rem 0.75rem);

		h3 {
			margin: 0;
			font-size: 1rem;
		}
	}

	dl {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: 0 1rem;
		margin: 0.5rem 0 0;
		font-size: 0.875rem;
	}

	dt {
		color: var(--fm-text-muted);
	}

	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}

	/* 状態は、色だけでなく文字でも示す */
	.state,
	.run {
		@include text.badge;
	}

	.ok,
	.succeeded {
		background: var(--fm-makeup-soft);
		color: var(--fm-makeup);
	}

	.failing,
	.skipped,
	.running {
		background: var(--fm-room-changed-soft);
		color: var(--fm-room-changed);
	}

	.unhealthy,
	.failed {
		background: var(--fm-cancelled-soft);
		color: var(--fm-cancelled);
	}

	.never {
		background: var(--fm-surface-muted);
		color: var(--fm-text-muted);
	}

	.error-text {
		color: var(--fm-error);
		overflow-wrap: anywhere;
	}

	.badge {
		margin-right: 0.5rem;
		padding: 0.125rem 0.5rem;
		border: 1px solid currentcolor;
		border-radius: 0.25rem;
		color: var(--fm-text-muted);
		font-size: 0.75rem;
		white-space: nowrap;
	}

	.jobs {
		margin: 0;
		padding: 0;
		list-style: none;

		form {
			@include mixins.cluster(0.5rem 1rem);
			justify-content: space-between;
			padding: 0.5rem 0;
			border-bottom: 1px dashed var(--fm-divider);
		}
	}

	section :global(.histogram) {
		max-width: 32rem;
		margin-top: 0.75rem;
	}

	section :global(.bar-cell) {
		width: 50%;
	}

	.bar {
		display: block;
		block-size: 0.75rem;
		border-radius: 0.25rem;
		background: var(--fm-primary);
	}

	.message {
		display: block;
		margin-top: 0.25rem;
		color: var(--fm-text-muted);
		overflow-wrap: anywhere;
	}
</style>
