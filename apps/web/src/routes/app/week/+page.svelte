<script lang="ts">
	import SegmentedButton, { Label as SegmentLabel, Segment } from '@smui/segmented-button';
	import Button, { Label as ButtonLabel } from '@smui/button';
	import Dialog, { Actions, Content, Header, Title } from '@smui/dialog';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import IconCalendar from '~icons/material-symbols/calendar-month-outline';
	import IconHoliday from '~icons/material-symbols/event-busy-outline';
	import IconImage from '~icons/material-symbols/image-outline';
	import IconNext from '~icons/material-symbols/chevron-right';
	import IconPrevious from '~icons/material-symbols/chevron-left';
	import IconSubstitute from '~icons/material-symbols/swap-horiz';
	import LessonRoom from '#lib/components/LessonRoom.svelte';
	import RadioField from '#lib/components/RadioField.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import ToggleButton from '#lib/components/ToggleButton.svelte';
	import { ABBREVIATION_DISPLAY_COOKIE } from '#lib/abbreviation-display.ts';
	import { notify } from '#lib/notify.svelte.ts';
	import {
		TIMETABLE_IMAGE_SIZES,
		type TimetableImageFormat,
		type TimetableImageSizeId,
	} from '#lib/timetable-image.ts';
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
		/** 押すと、そのコマの科目の登録と編集の画面に移る (曜日と時限を登録できる時限だけ) */
		editable: boolean;
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

	const weekUrl = (date: string) => resolve(`app/week?date=${date}`);

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

	/**
	 * ブラウザの日付の選択を開く。Chrome などは入力欄を押しても選択が開かないので showPicker で開く。
	 * Safari や Firefox は入力欄を直接押せば開くので、開けないときは何もしない
	 */
	function openPicker() {
		if (!picker) return;
		try {
			picker.showPicker();
		} catch {
			picker.focus();
		}
	}

	/** 日付を選んだら、その日を含む週に移る。年を打っている途中の日付 (0001 年など) では移らない */
	async function pickDate(event: Event & { currentTarget: HTMLInputElement }) {
		const date = event.currentTarget.value;
		if (/^(19|2\d)\d{2}-\d{2}-\d{2}$/.test(date)) await goto(weekUrl(date));
	}

	let timetableTable: HTMLTableElement | undefined = $state();
	let exportOpen = $state(false);
	let exportFormat: TimetableImageFormat = $state('png');
	let exportSizeId: TimetableImageSizeId = $state('wallpaper');
	let exporting = $state(false);

	/** 週の時間割の表を、選んだ形式と大きさの画像にして保存する。描画の道具は、押したときにだけ読み込む */
	async function saveTimetableImage() {
		if (!timetableTable || exporting) return;
		const size =
			TIMETABLE_IMAGE_SIZES.find((candidate) => candidate.id === exportSizeId) ??
			TIMETABLE_IMAGE_SIZES[0];
		exporting = true;
		try {
			const { downloadTimetableImage } = await import('#lib/timetable-image-export.ts');
			await downloadTimetableImage(timetableTable, {
				monday: data.monday,
				size,
				format: exportFormat,
				background: getComputedStyle(document.documentElement).backgroundColor,
			});
			exportOpen = false;
		} catch {
			notify('画像を保存できませんでした');
		} finally {
			exporting = false;
		}
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
	<title>時間割 - Funmary</title>
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
			<!-- 見えない入力欄をボタンに重ねる。スマホの Safari は、入力欄を直接押さないと日付の選択を開けない。キーボードはボタンから開く -->
			<input
				bind:this={picker}
				type="date"
				value={data.monday}
				onchange={pickDate}
				onclick={openPicker}
				tabindex="-1"
				aria-hidden="true"
			/>
		</div>
		<button
			type="button"
			class="icon-button"
			aria-label="週の時間割を画像で保存"
			title="画像で保存"
			onclick={() => (exportOpen = true)}
		>
			<IconImage aria-hidden="true" />
		</button>
		<a class="text-button" href={resolve('app/events')}>自分の予定</a>
		<div class="views" role="group" aria-label="時間割の見せ方">
			<ToggleButton
				label="略称表示"
				checked={showAbbreviations}
				onchange={selectAbbreviationDisplay}
			/>
			<SegmentedButton
				segments={[...WEEK_VIEWS]}
				singleSelect
				selected={view}
				aria-label="表示の範囲"
			>
				{#snippet segment(option: WeekView)}
					<Segment
						segment={option}
						title={VIEW_LABELS[option].title}
						onclick={() => selectView(option)}
					>
						<SegmentLabel>{VIEW_LABELS[option].text}</SegmentLabel>
					</Segment>
				{/snippet}
			</SegmentedButton>
		</div>
	</div>

	{#if !data.hasLessons}
		<p>この週に授業はありません。</p>
	{/if}

	<div class="scroll" data-view={view} bind:this={scroller}>
		<table bind:this={timetableTable}>
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
							<td
								class={{
									today: cell.date === data.today,
									off: offDates.has(cell.date),
									slot: row.editable,
								}}
							>
								{#if row.editable}
									<!-- コマ全体を押せるようにする。中の科目や予定のリンクは、この上に重ねる -->
									<a
										class="slot-link"
										href={resolve('/app/week/[date]/[period]', {
											date: cell.date,
											period: String(row.period),
										})}
										aria-label="{formatDate(cell.date)} {row.period} 限のコマ (科目の登録と編集)"
									></a>
								{/if}
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

	<!-- SMUI は外側の枠と中の面の両方に alertdialog の役割を付けるので、読み上げで 2 つにならないよう、
	     外側は役割なしにし、名前は中の面に付ける (ConfirmDialog と同じやり方) -->
	<Dialog
		bind:open={exportOpen}
		role="presentation"
		aria-modal={undefined}
		surface$aria-label="週の時間割を画像で保存"
	>
		<Header>
			<Title>週の時間割を画像で保存</Title>
		</Header>
		<Content>
			<div class="export-group" role="group" aria-label="形式">
				<p class="export-label">形式</p>
				<RadioField name="timetable-image-format" value="png" bind:group={exportFormat}
					>PNG</RadioField
				>
				<RadioField name="timetable-image-format" value="pdf" bind:group={exportFormat}
					>PDF</RadioField
				>
			</div>
			<div class="export-group" role="group" aria-label="大きさ">
				<p class="export-label">大きさ</p>
				{#each TIMETABLE_IMAGE_SIZES as size (size.id)}
					<RadioField name="timetable-image-size" value={size.id} bind:group={exportSizeId}
						>{size.label} ({size.width} x {size.height})</RadioField
					>
				{/each}
			</div>
		</Content>
		<Actions>
			<Button onclick={() => (exportOpen = false)}>
				<ButtonLabel>やめる</ButtonLabel>
			</Button>
			<Button onclick={saveTimetableImage} disabled={exporting}>
				<ButtonLabel>{exporting ? '作っています' : '保存する'}</ButtonLabel>
			</Button>
		</Actions>
	</Dialog>
</div>

<style lang="scss">
	@use './page';
</style>
