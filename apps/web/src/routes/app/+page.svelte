<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import InstallGuide from '#lib/components/InstallGuide.svelte';
	import LessonRoom from '#lib/components/LessonRoom.svelte';
	import PortalFreshness from '#lib/components/PortalFreshness.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import { formatMinutesUntil } from '#lib/bus-label.ts';
	import { canLocate, isLocationGranted, locateBusDirection } from '#lib/bus-location.ts';
	import type { EventView } from '#lib/server/event-view.ts';
	import type { LessonView } from '#lib/server/lesson-view.ts';
	import type { DayNote } from '@funmary/api';
	import { formatDate, formatDayNote } from '#lib/timetable-label.ts';
	import IconBus from '~icons/material-symbols/directions-bus-outline';
	import IconCalendar from '~icons/material-symbols/calendar-add-on-outline';
	import IconChevron from '~icons/material-symbols/chevron-right';
	import IconInfo from '~icons/material-symbols/info-outline';

	interface TodayView {
		date: string;
		note: DayNote | null;
		lessons: LessonView[];
		events: EventView[];
		next: (LessonView & { inProgress: boolean }) | null;
		hasRegistrations: boolean;
		/** カレンダーの購読の URL を発行していない */
		suggestCalendar: boolean;
		usesEstimatedTerms: boolean;
		fetchedAt: { date: string; time: string } | null;
		stale: boolean;
	}

	type BusDirection = 'toUniversity' | 'fromUniversity';

	interface BusLegView {
		from: string;
		to: string;
		/** これからの発車がなければ null */
		next: {
			time: string;
			routes: string[];
			destination: string | null;
			from: string;
			to: string;
			/** 発車の時刻 (ミリ秒)。開いたままでも「あと N 分」を合わせるのに使う */
			departsAt: number;
		} | null;
	}

	interface BusView {
		/** 学内の Wi-Fi で決めた向き */
		defaultDirection: BusDirection;
		/** 学内の Wi-Fi で決まったときは、現在地で決め直さない */
		canDecideByLocation: boolean;
		legs: Record<BusDirection, BusLegView | null>;
	}

	let {
		data,
	}: {
		data: { today: TodayView; bus: BusView | null };
	} = $props();

	const today = $derived(data.today);

	// バスの向きは、バスの画面と同じく、残さずに、学内の Wi-Fi と現在地から決める
	let located = $state<BusDirection | null>(null);
	const busDirection = $derived(located ?? data.bus?.defaultDirection ?? 'toUniversity');
	const busLeg = $derived(data.bus?.legs[busDirection] ?? null);

	// 学内の Wi-Fi で向きが決まっていなくて、すでに許可されているときだけ、開いたときに一度、現在地で決める
	let triedAutomatically = false;
	$effect(() => {
		if (triedAutomatically || !data.bus?.canDecideByLocation || !canLocate()) return;
		triedAutomatically = true;
		void isLocationGranted().then(async (granted) => {
			if (!granted) return;
			const result = await locateBusDirection();
			if ('direction' in result) located = result.direction;
		});
	});

	// 開いたままでも、発車したバスの次の便と「あと N 分」が進むよう、バスの画面と同じく 1 分ごとに読み直す
	let nowMs = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => {
			nowMs = Date.now();
			void invalidateAll();
		}, 60 * 1000);
		return () => clearInterval(timer);
	});
	const minutesUntilBus = $derived(
		busLeg?.next ? Math.max(0, Math.ceil((busLeg.next.departsAt - nowMs) / 60_000)) : null,
	);
</script>

<svelte:head>
	<title>ホーム - Funmary</title>
</svelte:head>

<div class="page">
	<h1>ホーム</h1>
	{#if today.note}
		<p class="note"><IconInfo aria-hidden="true" class="icon" />{formatDayNote(today.note)}</p>
	{/if}

	<section aria-labelledby="next-heading" class="next">
		<h2 id="next-heading">{today.next?.inProgress ? '授業中' : '次の授業'}</h2>
		{#if today.next}
			{@const next = today.next}
			<p class="next-time">
				{#if next.date !== today.date}<span class="next-date">{formatDate(next.date)}</span>{/if}
				{#if next.start && next.end}<time>{next.start}-{next.end}</time>{/if}
				<span class="period">{next.period} 限</span>
			</p>
			<p class="next-room"><LessonRoom room={next.room} tentative={next.roomIsTentative} /></p>
			<p class="next-subject">
				<a href={resolve('/app/subjects/[year]/[code]', next.subjectPath)}>{next.subjectName}</a>
				<StatusBadge status={next.status} />
			</p>
		{:else if today.hasRegistrations}
			<p>この先 2 週間に授業はありません。</p>
		{:else}
			<p>履修科目を登録すると、ここに次の授業の時刻と教室が出ます。</p>
			<p><a href={resolve('app/courses')}>履修科目を登録する</a></p>
		{/if}
	</section>

	{#if busLeg}
		<section aria-labelledby="bus-heading" class="bus">
			<h2 id="bus-heading">次のバス</h2>
			<a class="bus-link" href={resolve('app/bus')}>
				<IconBus aria-hidden="true" class="icon" />
				<span class="bus-body">
					{#if busLeg.next}
						<span class="bus-time">
							<time>{busLeg.next.time}</time>
							<span class="bus-until">{formatMinutesUntil(minutesUntilBus ?? 0)}</span>
						</span>
						<span class="muted">
							{busLeg.next.routes.join(' ')}
							{#if busLeg.next.destination}{busLeg.next.destination}行き{/if}
						</span>
						<span class="muted">{busLeg.next.from} → {busLeg.next.to}</span>
					{:else}
						<span class="bus-time">今日の発車は、もうありません</span>
						<span class="muted">{busLeg.from} → {busLeg.to}</span>
					{/if}
				</span>
				<IconChevron aria-hidden="true" class="chevron" />
			</a>
		</section>
	{/if}

	<section aria-labelledby="today-heading">
		<h2 id="today-heading">
			今日の授業 <time datetime={today.date}>{formatDate(today.date)}</time>
		</h2>
		{#if today.lessons.length > 0}
			<ul class="lessons">
				{#each today.lessons as lesson (lesson.key)}
					<li class={{ cancelled: lesson.status === 'cancelled' }}>
						<span class="when">
							<span class="period-number">{lesson.period} 限</span>
							{#if lesson.start}<time class="muted">{lesson.start}</time>{/if}
						</span>
						<span class="what">
							<a href={resolve('/app/subjects/[year]/[code]', lesson.subjectPath)}
								>{lesson.subjectName}</a
							>
							<StatusBadge status={lesson.status} />
						</span>
						<span class="room"
							><LessonRoom room={lesson.room} tentative={lesson.roomIsTentative} /></span
						>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">今日の授業はありません。</p>
		{/if}
	</section>

	{#if today.events.length > 0}
		<section aria-labelledby="events-heading">
			<h2 id="events-heading">今日の予定</h2>
			<ul class="events">
				{#each today.events as event (event.key)}
					<li>
						<span class="when">{event.time}</span>
						<span class="what">
							{#if event.added}
								<a href={resolve('/app/events/shared/[ref]', { ref: String(event.eventId) })}
									>{event.title}</a
								>
								<span class="muted">(加えた予定)</span>
							{:else}
								<a href={resolve('/app/events/[id]', { id: String(event.eventId) })}
									>{event.title}</a
								>
							{/if}
							{#if event.continued}<span class="muted">(続き)</span>{/if}
							{#if event.location}<span class="muted">{event.location}</span>{/if}
						</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if today.suggestCalendar}
		<a class="suggest" href={resolve('app/settings/calendar')}>
			<IconCalendar aria-hidden="true" class="icon" />
			<span>
				<span class="suggest-title">授業をカレンダーに入れる</span>
				<span class="muted"
					>Google カレンダーや iPhone のカレンダーに、休講を反映した授業の予定が入ります。</span
				>
			</span>
		</a>
	{/if}

	<PortalFreshness fetchedAt={today.fetchedAt} stale={today.stale} today={today.date} />
	<p class="freshness">
		<a href={resolve('app/changes')}>休講、補講、教室変更の一覧</a>
	</p>
	{#if today.usesEstimatedTerms}
		<p class="freshness">
			学期の期間は、大学の学年暦がまだ入っていないため、推定した日付で出しています。
		</p>
	{/if}

	<div class="install">
		<InstallGuide />
	</div>
</div>

<style lang="scss">
	@use './page';
</style>
