<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import IconBus from '~icons/material-symbols/directions-bus-outline';
	import IconChevron from '~icons/material-symbols/chevron-right';
	import IconLocation from '~icons/material-symbols/my-location-outline';
	import IconSchool from '~icons/material-symbols/school-outline';
	import IconStop from '~icons/material-symbols/pin-drop-outline';
	import IconSwap from '~icons/material-symbols/swap-vert';
	import IconWarning from '~icons/material-symbols/warning-outline';
	import { formatMinutesUntil } from '#lib/bus-label.ts';
	import { canLocate, isLocationGranted, locateBusDirection } from '#lib/bus-location.ts';
	import { BUS_DAY_COOKIE, secondsUntilJstMidnight } from '#lib/bus-state.ts';
	import type { PublicBusLeg, PublicLegDeparture } from '@funmary/api';

	type DayType = 'weekday' | 'holiday';
	type Direction = 'toUniversity' | 'fromUniversity';

	let {
		data,
	}: {
		data: {
			stopId: string | null;
			defaultDirection: Direction;
			canDecideByLocation: boolean;
			day: DayType;
			todayDay: DayType;
			legs: Record<Direction, Record<DayType, PublicBusLeg | null>>;
			universityName: string;
			nowTime: string;
			stale: boolean;
			hasStops: boolean;
		};
	} = $props();

	const DAY_LABELS: Record<DayType, string> = { weekday: '平日', holiday: '休日' };

	// 「あと N 分」が古くならないよう、1 分ごとに読み直す
	$effect(() => {
		const timer = setInterval(() => void invalidateAll(), 60 * 1000);
		return () => clearInterval(timer);
	});

	// 向きは、残さず、画面の中だけで入れ替える。1 分ごとに読み直しても消えないよう、$derived にはしない
	let swapped = $state<Direction | null>(null);
	const direction = $derived(swapped ?? data.defaultDirection);
	const toUniversity = $derived(direction === 'toUniversity');

	// 日の種類は Cookie に残す。サーバーが同じ値を返すので、読み直しても変わらない
	let day = $derived(data.day);

	function selectDay(next: DayType) {
		day = next;
		const secure = location.protocol === 'https:' ? '; secure' : '';
		document.cookie = `${BUS_DAY_COOKIE}=${next}; path=/; max-age=${secondsUntilJstMidnight(new Date())}; samesite=lax${secure}`;
	}

	const leg = $derived(data.legs[direction][day]);
	const isToday = $derived(day === data.todayDay);
	/** 今日の区分のとき、まだ発車していない最初の便 (これに目印を付けて、一覧をその位置に合わせる) */
	const nextIndex = $derived(
		isToday && leg ? leg.departures.findIndex((departure) => departure.time >= data.nowTime) : -1,
	);
	// 今日の区分では、一覧の目印と同じ便を出す (これからの発車には翌日の便も入るので、最終便のあとに出さないよう使わない)
	const nextDeparture = $derived(
		isToday ? (leg?.departures[nextIndex] ?? null) : (leg?.departures[0] ?? null),
	);
	const untilNext = $derived(leg?.upcoming[0]?.minutesUntil ?? null);

	// 選んだ停留所、向き、日の区分が変わったときだけ、一覧の中を、次の便が見える位置に合わせる
	let list: HTMLElement | undefined = $state();
	let scrolledFor = '';
	$effect(() => {
		const key = `${data.stopId}-${direction}-${day}`;
		if (!list || scrolledFor === key) return;
		scrolledFor = key;
		const next = list.querySelector<HTMLElement>('[data-next]');
		if (next) list.scrollTop = Math.max(next.offsetTop - list.clientHeight / 3, 0);
	});

	// 現在地で向きを決める。未来大の近くなら未来大から出る向き、離れていれば未来大へ向かう向き。
	// 許可の確認を、勝手には出さない。すでに許可されているときだけ自動で決め、そうでなければボタンから
	let locating = $state(false);
	/** 失敗の理由 (許可されなかったか、現在地を取れなかったか)。うまくいったら null */
	let locationProblem = $state<'denied' | 'unavailable' | null>(null);

	async function decideByLocation() {
		if (!data.stopId || locating) return;
		locating = true;
		locationProblem = null;
		const result = await locateBusDirection();
		locating = false;
		if ('direction' in result) swapped = result.direction;
		else locationProblem = result.problem;
	}

	// 位置情報が使える端末では、いつでもボタンを出す (向きを入れ替えたあとでも、現在地から決め直せるように)
	const locatable = $derived(canLocate());

	// 学内の Wi-Fi で向きが決まっていなくて、すでに許可されているときだけ、開いたときに一度、自動で決める。
	// 開いてすぐに入れ替えた向きは、あとから届いた現在地で上書きしない
	let triedAutomatically = false;
	$effect(() => {
		if (triedAutomatically || !data.canDecideByLocation || !canLocate()) return;
		triedAutomatically = true;
		void isLocationGranted().then((granted) => {
			if (granted && untrack(() => swapped) === null) void decideByLocation();
		});
	});
</script>

<svelte:head>
	<title>バス - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#snippet row(departure: PublicLegDeparture, index: number)}
	<li
		class={{ past: isToday && nextIndex !== -1 && index < nextIndex, next: index === nextIndex }}
		data-next={index === nextIndex ? '' : undefined}
		aria-current={index === nextIndex ? 'true' : undefined}
	>
		<span class="times">
			<span>{departure.time}</span>
			{#if departure.arrivalTime}<span class="arrow" aria-label="から">→</span><span
					>{departure.arrivalTime}</span
				>{/if}
		</span>
		<span class="detail">
			<span class="routes">{departure.routes.join(' ')}</span>
			{#if departure.destination}{departure.destination}行き{/if}
			{#each departure.marks as mark (mark)}<span class="mark">{mark}</span>{/each}
		</span>
		<span class="section">
			<IconBus aria-hidden="true" />
			<span>{departure.from.name} - {departure.to.name}</span>
			{#if departure.platformName}<span class="platform">{departure.platformName}</span>{/if}
		</span>
		{#if index === nextIndex && untilNext !== null}
			<span class="until">{formatMinutesUntil(untilNext)}</span>
		{/if}
	</li>
{/snippet}

{#snippet universityCard(label: string)}
	<div class="card fixed">
		<IconSchool aria-hidden="true" class="icon" />
		<span class="card-label">{label}</span>
		<span class="card-name">{data.universityName}</span>
	</div>
{/snippet}

{#snippet stopCard(label: string)}
	<a class="card picker" href={resolve('app/bus/stops')}>
		<IconStop aria-hidden="true" class="icon" />
		<span class="card-label">{label}</span>
		<span class="card-name">{leg?.stop.name ?? 'バス停を選ぶ'}</span>
		<IconChevron aria-hidden="true" class="chevron" />
	</a>
{/snippet}

<div class="bus-page">
	<h1>バス</h1>

	{#if data.stale}
		<p class="stale" role="status">
			<IconWarning aria-hidden="true" class="icon" />
			<span>時刻表を最後に確かめてから、日がたっています。古いかもしれません。</span>
		</p>
	{/if}

	{#if !data.hasStops || data.stopId === null}
		<p>時刻表は、まだ取り込めていません。しばらくしてからもう一度開いてください。</p>
	{:else}
		<div class="bus-workspace">
			<div class="overview">
				<section class="next-bus" aria-labelledby="next-bus-heading">
					<h2 id="next-bus-heading">次のバス</h2>
					{#if leg && nextDeparture}
						<div class="next-content">
							<time class="next-time">{nextDeparture.time}</time>
							{#if isToday && untilNext !== null}
								<span class="next-until">{formatMinutesUntil(untilNext)}</span>
							{:else if !isToday}
								<span class="muted">{DAY_LABELS[day]}ダイヤの最初の便</span>
							{/if}
							<p class="next-route">
								<strong>{nextDeparture.routes.join(' ')}</strong>
								{#if nextDeparture.destination}{nextDeparture.destination}行き{/if}
							</p>
							<p class="muted next-stops">{nextDeparture.from.name} → {nextDeparture.to.name}</p>
						</div>
					{:else if leg && !isToday}
						<p class="muted">{DAY_LABELS[day]}ダイヤの発車はありません。</p>
					{:else if leg}
						<p class="muted">今日の発車は、もうありません。</p>
						<p class="muted next-stops">{leg.from.name} → {leg.to.name}</p>
					{:else}
						<p class="muted">この向きの時刻表はありません。</p>
					{/if}
				</section>

				<section class="route-panel" aria-label="経路">
					<div class="trip">
						<button
							type="button"
							class="swap"
							onclick={() => (swapped = toUniversity ? 'fromUniversity' : 'toUniversity')}
							aria-label={toUniversity
								? '向きを入れ替える (未来大から出発)'
								: '向きを入れ替える (未来大へ向かう)'}
						>
							<IconSwap aria-hidden="true" />
						</button>
						<div class="cards">
							{#if toUniversity}
								{@render stopCard('出発')}
								{@render universityCard('到着')}
							{:else}
								{@render universityCard('出発')}
								{@render stopCard('到着')}
							{/if}
						</div>
					</div>

					{#if locatable}
						<p class="hint">
							<button type="button" class="locate" onclick={decideByLocation} disabled={locating}>
								<IconLocation aria-hidden="true" />現在地から向きを決める
							</button>
						</p>
						{#if locationProblem === 'denied'}
							<p class="muted hint" role="status">
								位置情報が許可されていません。端末の設定で、このアプリ (またはブラウザ)
								の位置情報を許可してください。
							</p>
						{:else if locationProblem === 'unavailable'}
							<p class="muted hint" role="status">
								現在地を取れませんでした。少し待って、もう一度試してください。
							</p>
						{/if}
					{/if}
				</section>
			</div>

			<section class="timetable-panel" aria-label="時刻表">
				{#if leg}
					<nav aria-label="日の種類">
						<ul class="days">
							{#each ['weekday', 'holiday'] as const as option (option)}
								<li>
									<button
										type="button"
										onclick={() => selectDay(option)}
										aria-pressed={day === option}
									>
										{DAY_LABELS[option]}{option === data.todayDay ? ' (今日)' : ''}
									</button>
								</li>
							{/each}
						</ul>
					</nav>

					<h2 id="departures-heading" class="visually-hidden">
						{leg.from.name}から{leg.to.name}への発車
					</h2>
					{#if leg.departures.length === 0}
						<p class="empty">
							{#if leg.checkedAt === null}
								この停留所の時刻表は、まだ取り込めていません。
							{:else}
								この日の、{leg.from.name}から{leg.to
									.name}へ向かう便は、取り込んだ時刻表にありません。
							{/if}
						</p>
					{:else}
						<ul class="departures" aria-labelledby="departures-heading" bind:this={list}>
							{#each leg.departures as departure, index (`${departure.time}-${departure.platformNo}-${departure.routes.join()}-${index}`)}
								{@render row(departure, index)}
							{/each}
						</ul>
						{#if isToday && nextIndex === -1}
							<p class="muted">今日の発車は、もうありません。</p>
						{/if}
					{/if}
				{:else}
					<p>この停留所の時刻表は、取り込んだ時刻表にありません。</p>
				{/if}
			</section>
		</div>

		<p class="muted meta">
			函館バスの公式のサービスではありません。ダイヤは、函館バスのサイトで確かめてください。
		</p>
	{/if}
</div>

<style lang="scss">
	@use 'breakpoints';
	@use 'mixins';
	@use 'touch';

	.bus-page {
		min-width: 0;
		max-width: 48rem;
	}

	.bus-workspace {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	.overview {
		flex: none;
	}

	.next-bus {
		display: none;
	}

	.trip {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.75rem 0 0.5rem;
	}

	.swap {
		display: inline-grid;
		flex: none;
		place-items: center;
		width: 48px;
		height: 48px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--fm-text-muted);
		cursor: pointer;

		&:hover {
			background: var(--fm-surface-muted);
		}

		:global(svg) {
			width: 1.5rem;
			height: 1.5rem;
		}
	}

	.cards {
		@include mixins.stack(0.5rem);
		flex: 1;
		min-width: 0;
	}

	.card {
		display: grid;
		grid-template-columns: auto 2.5rem 1fr auto;
		align-items: center;
		gap: 0.5rem;
		min-height: 52px;
		padding: 0 0.75rem;
		border-radius: 0.75rem;
		color: var(--fm-text);
		text-decoration: none;

		:global(.icon) {
			width: 1.25rem;
			height: 1.25rem;
			color: var(--fm-primary);
		}

		:global(.chevron) {
			color: var(--fm-text-muted);
		}

		.card-label {
			color: var(--fm-text-muted);
			font-size: 0.75rem;
		}
	}

	.timetable-panel {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-height: 0;
	}

	/* 選べる停留所は、浮かせて見せる。未来大は、固定なので平らにする */
	.card.picker {
		border: 1px solid var(--fm-divider);
		background: var(--fm-surface);
		box-shadow: 0 1px 3px rgb(0 0 0 / 12%);
	}

	.card.picker:hover {
		background: var(--fm-surface-muted);
	}

	.card.fixed {
		grid-template-columns: auto 2.5rem 1fr;
	}

	.card-name {
		overflow: hidden;
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.hint {
		margin: 0 0 0.25rem;
		font-size: 0.875rem;
	}

	.locate {
		@include touch.target;
		gap: 0.375rem;
		padding: 0 0.75rem;
		border: 1px solid var(--fm-divider);
		border-radius: 999px;
		background: var(--fm-surface);
		color: var(--fm-text);
		font: inherit;
		cursor: pointer;
	}

	.stale {
		display: flex;
		gap: 0.5rem;
		margin: 0.5rem 0 0;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		background: var(--fm-room-changed-soft);
		color: var(--fm-text);
		font-size: 0.875rem;

		:global(.icon) {
			color: var(--fm-room-changed);
		}
	}

	/* 平日と休日。2 つを同じ幅で並べ、選んでいるほうに下線を引く */
	.days {
		display: grid;
		grid-template-columns: 1fr 1fr;
		margin: 0.5rem 0 0;
		padding: 0;
		border-bottom: 1px solid var(--fm-divider);
		list-style: none;

		button {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 100%;
			min-height: 48px;
			border: 0;
			border-bottom: 3px solid transparent;
			background: none;
			color: var(--fm-text);
			font: inherit;
			cursor: pointer;
		}

		button[aria-pressed='true'] {
			border-bottom-color: var(--fm-primary);
			color: var(--fm-primary);
			font-weight: 700;
		}
	}

	.departures {
		position: relative;
		max-height: min(62dvh, 40rem);
		margin: 0;
		padding: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		list-style: none;

		li {
			display: grid;
			grid-template-columns: 1fr auto;
			gap: 0.125rem 0.75rem;
			padding: 0.75rem 0.5rem;
			border-bottom: 1px solid var(--fm-divider);
		}

		li:hover {
			background: var(--fm-surface-muted);
		}

		li.next:hover {
			background: var(--fm-primary-soft);
		}

		li.past {
			opacity: 0.5;
		}

		li.next {
			background: var(--fm-primary-soft);
		}

		.times {
			display: flex;
			align-items: baseline;
			gap: 0.5rem;
			font-size: 1.5rem;
			font-variant-numeric: tabular-nums;
			font-weight: 700;
			grid-column: 1;
		}

		.arrow {
			font-weight: 400;
		}

		.detail {
			grid-column: 1;
			color: var(--fm-text-muted);
			font-size: 0.875rem;
		}

		.routes {
			margin-right: 0.25rem;
		}

		.mark {
			margin-left: 0.25rem;
		}

		.section {
			@include mixins.cluster(0.375rem);
			grid-column: 1 / -1;

			:global(svg) {
				flex: none;
				width: 1.25rem;
				height: 1.25rem;
				color: var(--fm-primary);
			}
		}

		.platform {
			flex: none;
			color: var(--fm-text-muted);
			font-size: 0.75rem;
		}

		.until {
			grid-column: 2;
			grid-row: 1;
			align-self: center;
			color: var(--fm-primary);
			font-size: 0.875rem;
			font-weight: 700;
		}
	}

	.empty {
		margin: 1.5rem 0;
	}

	.meta {
		margin-top: 1.5rem;
		font-size: 0.8125rem;
	}

	@include breakpoints.wide {
		.bus-page {
			display: flex;
			flex-direction: column;
			flex: 1;
			width: 100%;
			max-width: none;
			min-height: 0;
		}

		h1 {
			flex: none;
			margin-bottom: 1rem;
		}

		.stale {
			flex: none;
			margin-bottom: 0.5rem;
		}

		.overview {
			display: grid;
			grid-template-columns: minmax(12rem, 3fr) minmax(18rem, 7fr);
			align-items: stretch;
			gap: 1rem;
			margin-bottom: 0.5rem;
		}

		.next-bus {
			display: flex;
			flex-direction: column;
			justify-content: center;
			min-width: 0;
			min-height: 7rem;
			padding: 0.75rem 1rem;
			border-radius: 0.75rem;
			background: var(--fm-primary-soft);

			h2 {
				margin: 0 0 0.25rem;
				color: var(--fm-primary);
				font-size: 1rem;
			}
		}

		.next-content {
			display: grid;
			grid-template-columns: auto 1fr;
			align-items: baseline;
			gap: 0 0.5rem;
		}

		.next-time {
			font-size: 2rem;
			font-weight: 700;
			line-height: 1.3;
			font-variant-numeric: tabular-nums;
		}

		.next-until {
			color: var(--fm-primary);
			font-size: 1rem;
		}

		.next-route,
		.next-stops {
			grid-column: 1 / -1;
			margin: 0;
			font-size: 1rem;
		}

		.route-panel {
			display: flex;
			flex-direction: column;
			justify-content: center;
			min-width: 0;
			width: 100%;
		}

		.trip {
			margin: 0 0 0.5rem;
		}

		.hint {
			margin: 0.25rem 0 0;
		}

		/* 便の一覧を横並びにするかは、画面ではなく一覧の幅で決める (列が収まらない幅で、残り時間が切れないように) */
		.timetable-panel {
			container: timetable / inline-size;
		}

		.departures {
			flex: 1;
			min-height: 0;
			max-height: none;

			@container timetable (min-width: 36rem) {
				display: grid;
				grid-template-columns:
					max-content minmax(8rem, 1.4fr) minmax(10rem, 1.7fr)
					minmax(5rem, 0.8fr);
				align-content: start;
				column-gap: 0.75rem;

				li {
					grid-column: 1 / -1;
					grid-template-columns: subgrid;
					align-items: center;
					gap: 0.75rem;
					min-height: 2.75rem;
					padding: 0.25rem 0.5rem;
				}

				.times,
				.detail,
				.section,
				.until {
					grid-column: auto;
					grid-row: auto;
				}

				.times {
					font-size: 1rem;
				}

				.section {
					flex-wrap: nowrap;
					min-width: 0;
					font-size: 0.875rem;
				}

				.section > span:first-of-type {
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}

				.until {
					justify-self: end;
					white-space: nowrap;
				}
			}
		}

		.empty {
			flex: 1;
		}

		.meta {
			flex: none;
			margin-top: 0.5rem;
		}
	}
</style>
