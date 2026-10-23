<script lang="ts">
	import Button, { Label } from '@smui/button';
	import TextField from '#lib/components/TextField.svelte';
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { confirmSubmit } from '#lib/actions/confirm-submit.ts';
	import { addDays } from '@funmary/core';
	import {
		dayMarks,
		yearGrid,
		type DayMarksInput,
		type TermBand,
	} from '#lib/academic-year-grid.ts';
	import { formatTerm, WEEKDAY_LABELS } from '#lib/term-label.ts';

	// 管理の学年暦の画面の、1 年分の月の格子。日を押すと、その日の振替授業日、全学の休講日、学期の端を決められる
	let {
		academicYear,
		today,
		input,
	}: { academicYear: number; today: string; input: DayMarksInput } = $props();

	const months = $derived(yearGrid(academicYear));
	const first = $derived(`${academicYear}-04-01`);
	const last = $derived(`${academicYear + 1}-03-31`);

	const WEEKDAY_HEADERS = ['日', '月', '火', '水', '木', '金', '土'];
	const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];
	const BAND_LABELS: Record<TermBand, string> = {
		spring: '前期',
		fall: '後期',
		'summer-intensive': '夏期集中',
		'winter-intensive': '冬期集中',
	};
	/** 学期の端を決めるときの選択肢の順 */
	const TERM_CHOICES = [
		'spring',
		'fall',
		'q1',
		'q2',
		'q3',
		'q4',
		'summer-intensive',
		'winter-intensive',
		'full-year',
	];

	/** キーボードで動かすときに、フォーカスを置く日 (格子の中で tabindex=0 になるのは 1 日だけ) */
	let focused = $state('');
	const focusDate = $derived(focused || (today >= first && today <= last ? today : first));
	let selected = $state<string | null>(null);
	let dialog: HTMLDialogElement | undefined = $state();
	let grid: HTMLDivElement | undefined = $state();

	const marks = $derived(selected ? dayMarks(selected, input) : null);
	let termChoice = $state('spring');

	function describe(date: string, weekday: number): string {
		const m = dayMarks(date, input);
		const parts = [
			`${Number(date.slice(5, 7))}月${Number(date.slice(8))}日 (${WEEKDAY_NAMES[weekday]})`,
		];
		if (m.band) parts.push(BAND_LABELS[m.band]);
		if (m.holiday) parts.push(`祝日 ${m.holiday}`);
		if (m.substitute) parts.push(`振替授業日 (${WEEKDAY_NAMES[m.substitute % 7]}曜の授業)`);
		if (m.noClass) parts.push(`全学の休講日${m.noClass.label ? ` (${m.noClass.label})` : ''}`);
		return parts.join('、');
	}

	function open(date: string) {
		selected = date;
		focused = date;
		termChoice = dayMarks(date, input).band ?? 'spring';
		dialog?.showModal();
	}

	async function onKeydown(event: KeyboardEvent, date: string) {
		const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
		if (step === undefined) return;
		event.preventDefault();
		const next = addDays(date, step);
		if (next < first || next > last) return;
		focused = next;
		await tick();
		grid?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus();
	}

	/** 保存に成功したら、ダイアログを閉じて、格子に戻る */
	const closeOnSuccess = () => {
		return async ({
			result,
			update,
		}: {
			result: { type: string };
			update: () => Promise<void>;
		}) => {
			await update();
			if (result.type === 'success') dialog?.close();
		};
	};

	const selectedTitle = $derived.by(() => {
		if (!selected) return '';
		const weekday = new Date(`${selected}T00:00:00Z`).getUTCDay();
		return `${Number(selected.slice(0, 4))}年${Number(selected.slice(5, 7))}月${Number(selected.slice(8))}日 (${WEEKDAY_NAMES[weekday]})`;
	});
	const defaultSubstitute = $derived.by(() => {
		if (!selected) return 1;
		const weekday = new Date(`${selected}T00:00:00Z`).getUTCDay();
		return weekday === 0 ? 1 : weekday;
	});
</script>

<ul class="legend" aria-label="凡例">
	<li><span class="swatch band-spring"></span>前期</li>
	<li><span class="swatch band-fall"></span>後期</li>
	<li><span class="swatch band-summer-intensive"></span>夏期集中</li>
	<li><span class="swatch band-winter-intensive"></span>冬期集中</li>
	<li><span class="swatch no-class"></span>全学の休講日</li>
	<li><span class="holiday-sample">12</span>祝日</li>
	<li><span class="sub-sample">月</span>振替授業日 (何曜の授業か)</li>
</ul>

<div class="months" bind:this={grid}>
	{#each months as month (month.label)}
		<section class="month" aria-label={month.label}>
			<h3>{month.label}</h3>
			<div class="days" role="grid" aria-label={month.label}>
				<div role="row" class="week">
					{#each WEEKDAY_HEADERS as header, i (header)}
						<span role="columnheader" class={['head', { sunday: i === 0, saturday: i === 6 }]}
							>{header}</span
						>
					{/each}
				</div>
				{#each month.weeks as week, w (w)}
					<div role="row" class="week">
						{#each week as day, i (day?.date ?? `${w}-${i}`)}
							{#if day}
								{@const m = dayMarks(day.date, input)}
								<span role="gridcell">
									<button
										type="button"
										data-date={day.date}
										tabindex={day.date === focusDate ? 0 : -1}
										aria-label={describe(day.date, day.weekday)}
										class={[
											'day',
											m.band && `band-${m.band}`,
											{
												'no-class': m.noClass,
												holiday: m.holiday || day.weekday === 0,
												today: day.date === today,
											},
										]}
										onclick={() => open(day.date)}
										onkeydown={(event) => onKeydown(event, day.date)}
									>
										<span class="number">{day.day}</span>
										{#if m.substitute}
											<span class="sub" aria-hidden="true">{WEEKDAY_NAMES[m.substitute % 7]}</span>
										{/if}
									</button>
								</span>
							{:else}
								<span role="gridcell" class="empty"></span>
							{/if}
						{/each}
					</div>
				{/each}
			</div>
		</section>
	{/each}
</div>

<dialog bind:this={dialog} aria-labelledby="day-dialog-title" onclose={() => (selected = null)}>
	{#if selected && marks}
		<h3 id="day-dialog-title">{selectedTitle}</h3>
		<ul class="facts">
			<li>学期: {marks.terms.length > 0 ? marks.terms.map(formatTerm).join('、') : 'なし'}</li>
			{#if marks.holiday}<li>祝日: {marks.holiday}</li>{/if}
		</ul>

		<h4>振替授業日</h4>
		{#if marks.substitute}
			<form
				method="POST"
				action="?/deleteSubstituteDay"
				use:confirmSubmit={'振替授業日をやめます。よろしいですか?'}
				use:enhance={closeOnSuccess}
				class="row"
			>
				<span>{WEEKDAY_NAMES[marks.substitute % 7]}曜の授業を行う日です。</span>
				<input type="hidden" name="date" value={selected} />
				<Button type="submit" variant="outlined"><Label>振替授業日をやめる</Label></Button>
			</form>
		{:else}
			<form method="POST" action="?/saveSubstituteDay" use:enhance={closeOnSuccess} class="row">
				<input type="hidden" name="date" value={selected} />
				<label>
					行う授業の曜日
					<select name="weekday" value={String(defaultSubstitute)}>
						{#each WEEKDAY_LABELS as day (day.weekday)}
							<option value={String(day.weekday)}>{day.label}曜</option>
						{/each}
					</select>
				</label>
				<Button type="submit" variant="unelevated"><Label>振替授業日にする</Label></Button>
			</form>
		{/if}

		<h4>全学の休講日</h4>
		{#if marks.noClass}
			<form
				method="POST"
				action="?/deleteNoClassDay"
				use:confirmSubmit={'休講日をやめます。よろしいですか?'}
				use:enhance={closeOnSuccess}
				class="row"
			>
				<span>全学の休講日です{marks.noClass.label ? ` (${marks.noClass.label})` : ''}。</span>
				<input type="hidden" name="date" value={selected} />
				<Button type="submit" variant="outlined"><Label>休講日をやめる</Label></Button>
			</form>
		{:else}
			<form method="POST" action="?/saveNoClassDay" use:enhance={closeOnSuccess} class="row">
				<input type="hidden" name="date" value={selected} />
				<TextField label="行事名 (任意)" name="label" maxlength={100} />
				<Button type="submit" variant="unelevated"><Label>全学の休講日にする</Label></Button>
			</form>
		{/if}

		<h4>学期の期間</h4>
		<form method="POST" action="?/setTermEdge" use:enhance={closeOnSuccess} class="row">
			<input type="hidden" name="date" value={selected} />
			<label>
				学期
				<select name="term" bind:value={termChoice}>
					{#each TERM_CHOICES as term (term)}
						<option value={term}>{formatTerm(term)}</option>
					{/each}
				</select>
			</label>
			<Button type="submit" name="edge" value="start" variant="outlined">
				<Label>この日を始まりにする</Label>
			</Button>
			<Button type="submit" name="edge" value="end" variant="outlined">
				<Label>この日を終わりにする</Label>
			</Button>
		</form>

		<form method="dialog" class="close">
			<Button type="submit"><Label>閉じる</Label></Button>
		</form>
	{/if}
</dialog>

<style lang="scss">
	@use './YearCalendar';
</style>
