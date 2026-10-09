<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import IconCalendar from '~icons/material-symbols/calendar-month-outline';
	import IconHoliday from '~icons/material-symbols/event-busy-outline';
	import IconNext from '~icons/material-symbols/chevron-right';
	import IconPrevious from '~icons/material-symbols/chevron-left';
	import IconSubstitute from '~icons/material-symbols/swap-horiz';
	import LessonRoom from '#lib/components/LessonRoom.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import ToggleButton from '#lib/components/ToggleButton.svelte';
	import { ABBREVIATION_DISPLAY_COOKIE } from '#lib/abbreviation-display.ts';
	import type { EventView } from '#lib/server/event-view.ts';
	import type { LessonView } from '#lib/server/lesson-view.ts';
	import type { DayNote } from '@funmary/api';
	import {
		formatDate,
		formatDayNote,
		formatMonthDay,
		formatWeekday,
	} from '#lib/timetable-label.ts';
	import { WEEK_VIEW_COOKIE, WEEK_VIEWS, type WeekView } from '#lib/week-view.ts';

	interface Row {
		period: number;
		start: string | null;
		end: string | null;
		cells: { date: string; lessons: LessonView[]; events: EventView[] }[];
	}

	let {
		data,
	}: {
		data: {
			monday: string;
			previous: string;
			next: string;
			isThisWeek: boolean;
			today: string;
			view: WeekView;
			showAbbreviations: boolean;
			abbreviations: Map<number, string>;
			days: { date: string; note: DayNote | null }[];
			rows: Row[];
			eventCells: { date: string; events: EventView[] }[];
			hasLessons: boolean;
			usesEstimatedTerms: boolean;
		};
	} = $props();

	const weekUrl = (date: string) => `${resolve('app/week')}?date=${date}`;

	/** 見せ方の選び方。自動は、狭い画面では 1 日ずつ、広い画面では週を並べる */
	const VIEW_LABELS: Record<WeekView, { text: string; title: string }> = {
		auto: { text: '自動', title: '狭い画面では 1 日ずつ、広い画面では 1 週間を並べる' },
		day: { text: '1日', title: '1 日ずつ、横に送って見る' },
		week: { text: '週', title: '1 週間を並べて見る' },
	};

	let view = $derived(data.view);
	let showAbbreviations = $derived(data.showAbbreviations);

	function selectAbbreviationDisplay(checked: boolean) {
		showAbbreviations = checked;
		const secure = location.protocol === 'https:' ? '; secure' : '';
		document.cookie = `${ABBREVIATION_DISPLAY_COOKIE}=${checked ? 'on' : 'off'}; path=/; max-age=31536000; samesite=lax${secure}`;
	}
	let scroller: HTMLDivElement | undefined = $state();

	function selectView(next: WeekView) {
		view = next;
		const secure = location.protocol === 'https:' ? '; secure' : '';
		document.cookie =
			next === 'auto'
				? `${WEEK_VIEW_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`
				: `${WEEK_VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax${secure}`;
	}

	// 1 日ずつ見ているとき (表が横にはみ出すとき) は、開いたときと週や見せ方を変えたときに、今日の列に合わせる。
	// 今日がこの週になければ左端 (月曜) のまま。表が収まっているときは、動かしても何も起きない
	$effect(() => {
		void [data.monday, view];
		if (!scroller) return;
		const head = scroller.querySelector<HTMLElement>('thead th.today');
		scroller.scrollLeft = head ? head.offsetLeft + head.offsetWidth - scroller.clientWidth : 0;
	});

	let picker: HTMLInputElement | undefined = $state();

	/** カレンダーのボタン。ブラウザの日付の選択を開く (開けないブラウザでは、入力欄に移る) */
	function openPicker() {
		if (!picker) return;
		try {
			picker.showPicker();
		} catch {
			// 古いブラウザなどで開けないときは、入力欄に移って、キーボードで入れられるようにする
			picker.focus();
		}
	}

	/** 日付を選んだら、その日を含む週に移る */
	async function pickDate(event: Event & { currentTarget: HTMLInputElement }) {
		const date = event.currentTarget.value;
		if (date) await goto(weekUrl(date));
	}

	/** 日付の横に出すラベル。祝日と全学の休講日は授業がないので、列も灰色にする */
	const NOTE_BADGES = {
		holiday: { label: '祝日', icon: IconHoliday },
		noClass: { label: '休講日', icon: IconHoliday },
		substitute: { label: '振替', icon: IconSubstitute },
	} as const;

	const isDayOff = (note: DayNote | null) => note?.kind === 'holiday' || note?.kind === 'noClass';
	const offDates = $derived(
		new Set(data.days.filter((day) => isDayOff(day.note)).map((day) => day.date)),
	);
</script>

{#snippet eventCard(event: EventView, showTime: boolean = true)}
	<div class="event">
		{#if event.added}
			<a href={resolve('/app/events/shared/[ref]', { ref: String(event.eventId) })}>{event.title}</a
			>
		{:else}
			<a href={resolve('/app/events/[id]', { id: String(event.eventId) })}>{event.title}</a>
		{/if}
		{#if showTime}
			<!-- 「予定」行は、どの時限かが行から分からないので、時刻や時限の文を出す -->
			<span class="time"
				>{event.time}{event.continued ? ' (続き)' : ''}{event.added ? ' (加えた予定)' : ''}</span
			>
		{:else if event.continued || event.added}
			<!-- 時限の行は、行自体が時限を示しているので、時刻や時限は繰り返さない (続きと加えた予定だけ出す) -->
			<span class="time"
				>{event.continued ? '(続き)' : ''}{event.continued && event.added ? ' ' : ''}{event.added
					? '(加えた予定)'
					: ''}</span
			>
		{/if}
		{#if event.location}<span class="room">{event.location}</span>{/if}
	</div>
{/snippet}

<svelte:head>
	<title>週の時間割 - Funmary</title>
</svelte:head>

<div class="page page-w-72">
	<h1>{formatDate(data.monday)} からの週</h1>

	<div class="toolbar">
		<nav aria-label="週の切り替え" class="weeks">
			<!-- eslint-disable svelte/no-navigation-without-resolve -- resolve した /week に、週の日付を足している -->
			<a class="icon-button" href={weekUrl(data.previous)} aria-label="前の週" title="前の週">
				<IconPrevious aria-hidden="true" />
			</a>
			<!-- 今週を見ているときも同じ場所に置き、ほかのボタンの位置を変えない -->
			{#if data.isThisWeek}
				<span class="text-button current" aria-current="date">今週</span>
			{:else}
				<a class="text-button" href={resolve('app/week')}>今週</a>
			{/if}
			<a class="icon-button" href={weekUrl(data.next)} aria-label="次の週" title="次の週">
				<IconNext aria-hidden="true" />
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</nav>
		<div class="picker">
			<button
				type="button"
				class="icon-button"
				aria-label="カレンダーで日付を選んで、その週を出す"
				title="カレンダーで選ぶ"
				onclick={openPicker}
			>
				<IconCalendar aria-hidden="true" />
			</button>
			<!-- 日付の選択はボタンから開く。入力欄そのものは見せず、Tab でも止まらない -->
			<input
				bind:this={picker}
				type="date"
				value={data.monday}
				onchange={pickDate}
				tabindex="-1"
				aria-hidden="true"
			/>
		</div>
		<a class="text-button" href={resolve('app/events')}>自分の予定</a>
		<div class="views" role="group" aria-label="時間割の見せ方">
			<ToggleButton
				label="略称表示"
				checked={showAbbreviations}
				onchange={selectAbbreviationDisplay}
			/>
			{#each WEEK_VIEWS as option (option)}
				<button
					type="button"
					class="text-button"
					aria-pressed={view === option}
					title={VIEW_LABELS[option].title}
					onclick={() => selectView(option)}
				>
					{VIEW_LABELS[option].text}
				</button>
			{/each}
		</div>
	</div>

	{#if !data.hasLessons}
		<p>この週に授業はありません。</p>
	{/if}

	<div class="scroll" data-view={view} bind:this={scroller}>
		<table>
			<caption class="visually-hidden">{formatDate(data.monday)} からの週の時間割</caption>
			<thead>
				<tr>
					<th scope="col"><span class="visually-hidden">時限</span></th>
					{#each data.days as day (day.date)}
						<th scope="col" class={{ today: day.date === data.today, off: isDayOff(day.note) }}>
							<span class="date"
								>{formatMonthDay(day.date)}
								<span class="weekday">{formatWeekday(day.date)}</span></span
							>
							{#if day.note}
								{@const badge = NOTE_BADGES[day.note.kind]}
								<span class={['day-badge', day.note.kind]}>
									<badge.icon aria-hidden="true" />{badge.label}
								</span>
								<span class="note">{formatDayNote(day.note)}</span>
							{/if}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#if data.eventCells.some((cell) => cell.events.length > 0)}
					<tr>
						<th scope="row">予定</th>
						{#each data.eventCells as cell (cell.date)}
							<td class={{ today: cell.date === data.today, off: offDates.has(cell.date) }}>
								{#each cell.events as event (event.key)}
									{@render eventCard(event)}
								{/each}
							</td>
						{/each}
					</tr>
				{/if}
				{#each data.rows as row (row.period)}
					<tr>
						<th scope="row">
							{row.period} 限
							{#if row.start && row.end}
								<span class="time"
									><span class="start">{row.start}-</span><span class="end">{row.end}</span></span
								>
							{/if}
						</th>
						{#each row.cells as cell (cell.date)}
							<td class={{ today: cell.date === data.today, off: offDates.has(cell.date) }}>
								{#each cell.events as event (event.key)}
									{@render eventCard(event, false)}
								{/each}
								{#each cell.lessons as lesson (lesson.key)}
									<div class={['lesson', { cancelled: lesson.status === 'cancelled' }]}>
										<a
											href={resolve('/app/subjects/[year]/[code]', lesson.subjectPath)}
											title={lesson.subjectName}
											>{(showAbbreviations && data.abbreviations.get(lesson.subjectId)) ||
												lesson.subjectName}</a
										>
										<StatusBadge status={lesson.status} />
										<span class="room">
											<LessonRoom room={lesson.room} tentative={lesson.roomIsTentative} />
										</span>
									</div>
								{/each}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if data.usesEstimatedTerms}
		<p class="note">
			学期の期間は、大学の学年暦がまだ入っていないため、推定した日付で出しています。
		</p>
	{/if}
</div>

<style lang="scss">
	@use 'breakpoints';
	@use 'toolbar-button';

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	.weeks {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	.icon-button,
	.text-button {
		@include toolbar-button.base;
	}
	.icon-button :global(svg) {
		width: 1.5rem;
		height: 1.5rem;
	}
	.text-button {
		padding: 0 1rem;
	}
	.text-button.current {
		color: var(--fm-text-muted);
		cursor: default;
	}
	.text-button.current:hover {
		background: var(--fm-surface);
	}
	.picker {
		position: relative;
	}
	.views {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		max-width: 100%;
		gap: 0.25rem;
		margin-left: auto;
	}
	.views .text-button[aria-pressed='true'] {
		border-color: var(--fm-primary);
		background: var(--fm-primary-soft);
	}
	/* 日付の選択が、カレンダーのボタンの下に開くよう、入力欄をボタンの下に重ねて隠す */
	.picker input {
		position: absolute;
		left: 0;
		bottom: 0;
		width: 1px;
		height: 1px;
		min-height: 0;
		padding: 0;
		border: 0;
		opacity: 0;
		pointer-events: none;
	}
	/* 1 日ずつ見るときは、表を横に送る */
	@mixin one-day {
		scroll-snap-type: x mandatory;
		table {
			width: auto;
			table-layout: auto;
		}
		thead th:not(:first-child),
		td {
			min-width: min(calc(100vw - 9rem), 32rem);
			scroll-snap-align: end;
		}
	}
	/* 1 週間を並べるときは、幅を等分する。狭い画面では、余白と文字を詰める */
	@mixin narrow-week {
		th,
		td {
			padding: 0.25rem;
			font-size: 0.8125rem;
			overflow-wrap: anywhere;
		}
		thead th:first-child,
		tbody th {
			width: 3.25rem;
			white-space: normal;
		}
		.time {
			font-size: 0.6875rem;
		}
	}
	.scroll {
		overflow-x: auto;
		/* overflow-x を auto にすると、overflow-y は visible を指定しても既定で auto になり (CSS Overflow の仕様)、
		   縦のスクロールがこの中に閉じ込められることがある。auto への読み替えの対象外の clip を指定し、
		   縦はページのスクロールに任せる */
		overflow-y: clip;
	}
	.scroll[data-view='day'] {
		@include one-day;
	}
	.scroll[data-view='auto'] {
		@include breakpoints.narrow {
			@include one-day;
		}
	}
	.scroll[data-view='week'] {
		@include breakpoints.narrow {
			@include narrow-week;
		}
	}
	table {
		width: 100%;
		table-layout: fixed;
		border-collapse: collapse;
	}
	th,
	td {
		padding: 0.5rem;
		border: 1px solid var(--fm-divider);
		vertical-align: top;
		text-align: left;
	}
	tbody th {
		width: 4.5rem;
		position: sticky;
		left: 0;
		background: var(--fm-background);
		white-space: nowrap;
	}
	thead th:first-child {
		width: 4.5rem;
	}
	thead th {
		background: var(--fm-background);
	}
	.today {
		background: var(--fm-primary-soft);
	}
	/* 祝日と全学の休講日は授業がないので、列を灰色にする */
	.off {
		background: var(--fm-surface-muted);
	}
	.date {
		display: block;
	}
	/* 幅が狭いときは、曜日を必ず 2 行目に、時刻を「開始-」と「終了」の 2 行に、すべての列でそろえる */
	@include breakpoints.narrow {
		.weekday,
		.start,
		.end {
			display: block;
		}
	}
	.day-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.125rem;
		margin-top: 0.25rem;
		padding: 0 0.375rem 0 0.25rem;
		border: 1px solid currentColor;
		border-radius: 0.375rem;
		color: var(--fm-primary);
		font-size: 0.75rem;
		font-weight: 700;
		line-height: 1.6;
	}
	.day-badge :global(svg) {
		width: 0.875rem;
		height: 0.875rem;
	}
	.day-badge.substitute {
		color: var(--fm-link);
	}
	.time,
	.note {
		display: block;
		color: var(--fm-text-muted);
		font-size: 0.75rem;
		font-weight: normal;
	}
	.event + .event {
		margin-top: 0.5rem;
	}
	.event + .lesson {
		margin-top: 0.5rem;
	}
	.event a {
		display: block;
	}
	.lesson + .lesson {
		margin-top: 0.5rem;
	}
	.lesson a {
		display: block;
	}
	.cancelled a {
		text-decoration: line-through;
	}
	.room {
		display: block;
		font-size: 0.875rem;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
