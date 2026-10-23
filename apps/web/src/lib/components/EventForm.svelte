<script lang="ts">
	import SelectField from '#lib/components/SelectField.svelte';
	import CheckboxField from '#lib/components/CheckboxField.svelte';
	import RadioField from '#lib/components/RadioField.svelte';
	import TextField from '#lib/components/TextField.svelte';
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import type { EventFormValues } from '#lib/event-form.ts';

	interface Candidate {
		date: string;
		label: string;
	}

	let {
		values,
		error = undefined,
		submitLabel,
		candidates = [],
		keptExclusions = [],
		action = undefined,
	}: {
		values: EventFormValues;
		error?: string | undefined;
		submitLabel: string;
		/** 編集のとき、「この日は除く」を選べる、これからの各回 */
		candidates?: Candidate[];
		/** 候補の外にあるが、残しておく、除く日 */
		keptExclusions?: string[];
		/** 送り先の操作。省くと、そのページの標準の操作 */
		action?: string | undefined;
	} = $props();

	// 選ぶと、欄の出し入れが変わる項目。選ぶまでは、渡された値のまま。ほかの欄は、値をそのまま入れる
	let chosen: { timeKind?: string; repeat?: string; endKind?: string } = $state({});
	const timeKind = $derived(chosen.timeKind ?? values.timeKind);
	const repeat = $derived((chosen.repeat ?? values.repeat) as keyof typeof UNITS);
	const endKind = $derived(chosen.endKind ?? values.endKind);

	const WEEKDAYS = [
		{ value: '1', label: '月' },
		{ value: '2', label: '火' },
		{ value: '3', label: '水' },
		{ value: '4', label: '木' },
		{ value: '5', label: '金' },
		{ value: '6', label: '土' },
		{ value: '7', label: '日' },
	];
	const PERIODS = [1, 2, 3, 4, 5, 6];
	const UNITS = { daily: '日', weekly: '週', monthly: 'か月', yearly: '年', none: '' } as const;
</script>

<form method="POST" {action} use:enhance class="event-form">
	<FormNotice {error} />

	<TextField label="予定の名前" name="title" required maxlength={100} value={values.title} />
	<TextField label="場所 (任意)" name="location" maxlength={100} value={values.location} />
	<TextField
		label="メモ (任意)"
		textarea
		name="notes"
		maxlength={1000}
		rows={3}
		value={values.notes}
	/>

	<fieldset>
		<legend>日付</legend>
		<div class="row">
			<TextField label="開始日" type="date" name="startDate" required value={values.startDate} />
			<TextField
				label="終了日 (数日にわたるときだけ)"
				type="date"
				name="endDate"
				value={values.endDate}
			/>
		</div>
	</fieldset>

	<fieldset>
		<legend>時間</legend>
		<div class="choices">
			<RadioField
				name="timeKind"
				value="allDay"
				group={timeKind}
				onchange={() => (chosen.timeKind = 'allDay')}>終日</RadioField
			>
			<RadioField
				name="timeKind"
				value="time"
				group={timeKind}
				onchange={() => (chosen.timeKind = 'time')}>時刻で決める</RadioField
			>
			<RadioField
				name="timeKind"
				value="period"
				group={timeKind}
				onchange={() => (chosen.timeKind = 'period')}>時限で決める</RadioField
			>
		</div>
		{#if timeKind === 'time'}
			<div class="row">
				<TextField label="始まり" type="time" name="startTime" required value={values.startTime} />
				<TextField label="終わり" type="time" name="endTime" required value={values.endTime} />
			</div>
		{:else if timeKind === 'period'}
			<div class="row">
				<SelectField label="始まりの時限" name="startPeriod" value={values.startPeriod}>
					{#each PERIODS as period (period)}
						<option value={String(period)}>{period} 限</option>
					{/each}
				</SelectField>
				<SelectField label="終わりの時限" name="endPeriod" value={values.endPeriod}>
					{#each PERIODS as period (period)}
						<option value={String(period)}>{period} 限</option>
					{/each}
				</SelectField>
			</div>
		{/if}
		<p class="hint">数日にわたる予定は、終日だけ選べます。</p>
	</fieldset>

	<fieldset>
		<legend>繰り返し</legend>
		<SelectField
			label="繰り返しの種類"
			name="repeat"
			bind:value={() => repeat, (value) => (chosen.repeat = String(value))}
		>
			<option value="none">繰り返さない</option>
			<option value="daily">毎日</option>
			<option value="weekly">毎週</option>
			<option value="monthly">毎月</option>
			<option value="yearly">毎年</option>
		</SelectField>

		{#if repeat !== 'none'}
			<TextField
				class="narrow"
				label="間隔 (何{UNITS[repeat]}ごとか)"
				type="number"
				name="interval"
				min={1}
				max={99}
				required
				value={values.interval}
			/>

			{#if repeat === 'weekly'}
				<fieldset class="inner">
					<legend>曜日 (選ばなければ、開始日の曜日)</legend>
					<div class="choices">
						{#each WEEKDAYS as weekday (weekday.value)}
							<CheckboxField
								name="weekday"
								value={weekday.value}
								checked={values.weekdays.includes(weekday.value)}>{weekday.label}</CheckboxField
							>
						{/each}
					</div>
				</fieldset>
			{:else if repeat === 'monthly'}
				<fieldset class="inner">
					<legend>毎月の決め方</legend>
					<RadioField name="monthlyMode" value="day" group={values.monthlyMode}
						>開始日と同じ日付</RadioField
					>
					<RadioField name="monthlyMode" value="nth" group={values.monthlyMode}
						>開始日と同じ、第何曜日 (例: 第 2 火曜日)</RadioField
					>
					<RadioField name="monthlyMode" value="last" group={values.monthlyMode}
						>開始日と同じ曜日の、最終週</RadioField
					>
				</fieldset>
			{/if}

			<fieldset class="inner">
				<legend>終わり</legend>
				<RadioField
					name="endKind"
					value="never"
					group={endKind}
					onchange={() => (chosen.endKind = 'never')}>終わりなし</RadioField
				>
				<RadioField
					name="endKind"
					value="until"
					group={endKind}
					onchange={() => (chosen.endKind = 'until')}>日付まで</RadioField
				>
				<RadioField
					name="endKind"
					value="count"
					group={endKind}
					onchange={() => (chosen.endKind = 'count')}>回数まで</RadioField
				>
				{#if endKind === 'until'}
					<TextField
						class="narrow"
						label="終わりの日"
						type="date"
						name="untilDate"
						required
						value={values.untilDate}
					/>
				{:else if endKind === 'count'}
					<TextField
						class="narrow"
						label="繰り返す回数"
						type="number"
						name="count"
						min={1}
						max={999}
						required
						value={values.count}
					/>
				{/if}
			</fieldset>

			{#if candidates.length > 0}
				<fieldset class="inner">
					<legend>この日は除く</legend>
					<div class="excludes">
						{#each candidates as candidate (candidate.date)}
							<CheckboxField
								name="exclude"
								value={candidate.date}
								checked={values.excludedDates.includes(candidate.date)}
								>{candidate.label}</CheckboxField
							>
						{/each}
					</div>
				</fieldset>
			{/if}
			{#each keptExclusions as date (date)}
				<input type="hidden" name="exclude" value={date} />
			{/each}
		{/if}
	</fieldset>

	<fieldset>
		<legend>公開範囲</legend>
		<RadioField name="visibility" value="private" group={values.visibility}>自分だけ</RadioField>
		<RadioField name="visibility" value="link" group={values.visibility}
			>共有のリンクを知っている人 (Funmary にログインした人だけ)</RadioField
		>
		<RadioField name="visibility" value="public" group={values.visibility}
			>Funmary にログインしている全員 (「みんなの予定」に載る)</RadioField
		>
		<p class="hint">
			公開した予定に、あなたの名前やメールアドレスは出ません。公開をやめると、ほかの人の時間割から消えます。
		</p>
	</fieldset>

	<Button type="submit" variant="unelevated"><Label>{submitLabel}</Label></Button>
</form>

<style lang="scss">
	@use 'mixins';
	@use 'surfaces';
	@use 'text';

	.event-form {
		@include mixins.stack(1rem);
		max-width: 40rem;
	}
	fieldset {
		@include mixins.stack(0.5rem);
		@include surfaces.outlined($margin: 0);
	}
	fieldset.inner {
		margin-top: 0.5rem;
	}
	legend {
		padding: 0 0.25rem;
		font-weight: 500;
	}
	.event-form :global(.narrow) {
		max-width: 12rem;
	}
	.row {
		@include mixins.wrap-row(0.5rem 1rem);

		// ラベルが欄の枠に収まる幅にする
		> :global(.mdc-text-field),
		> :global(.select-field) {
			flex: 1 1 14rem;
		}
	}
	.choices {
		@include mixins.wrap-row(0.25rem 1rem);
	}
	.excludes {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
		gap: 0 1rem;
	}
	.hint {
		@include text.muted;
	}
	/* gap で間隔を取る親の中なので、<p> の既定の margin を消す */
	.event-form :global(.notice) {
		margin: 0;
	}
</style>
