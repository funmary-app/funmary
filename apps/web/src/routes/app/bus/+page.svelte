<script lang="ts">
	import Tab, { Label as TabLabel } from '@smui/tab';
	import TabBar from '@smui/tab-bar';
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
	const DAYS: DayType[] = ['weekday', 'holiday'];

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
					<TabBar
						class="days"
						tabs={DAYS}
						active={day}
						aria-label="日の種類"
						onSMUITabBarActivated={(event: CustomEvent<{ index: number }>) =>
							selectDay(DAYS[event.detail.index] ?? day)}
					>
						{#snippet tab(option: DayType)}
							<Tab tab={option}>
								<TabLabel>{DAY_LABELS[option]}{option === data.todayDay ? ' (今日)' : ''}</TabLabel>
							</Tab>
						{/snippet}
					</TabBar>

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
	@use './page';
</style>
