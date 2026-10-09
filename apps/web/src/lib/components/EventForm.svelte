<script lang="ts">
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

	<label class="field">
		予定の名前
		<input name="title" required maxlength="100" value={values.title} />
	</label>
	<label class="field">
		場所 (任意)
		<input name="location" maxlength="100" value={values.location} />
	</label>
	<label class="field">
		メモ (任意)
		<textarea name="notes" maxlength="1000" rows="3">{values.notes}</textarea>
	</label>

	<fieldset>
		<legend>日付</legend>
		<div class="row">
			<label class="field">
				開始日
				<input type="date" name="startDate" required value={values.startDate} />
			</label>
			<label class="field">
				終了日 (数日にわたるときだけ)
				<input type="date" name="endDate" value={values.endDate} />
			</label>
		</div>
	</fieldset>

	<fieldset>
		<legend>時間</legend>
		<div class="choices">
			<label class="choice">
				<input
					type="radio"
					name="timeKind"
					value="allDay"
					checked={timeKind === 'allDay'}
					onchange={() => (chosen.timeKind = 'allDay')}
				/>終日
			</label>
			<label class="choice">
				<input
					type="radio"
					name="timeKind"
					value="time"
					checked={timeKind === 'time'}
					onchange={() => (chosen.timeKind = 'time')}
				/>時刻で決める
			</label>
			<label class="choice">
				<input
					type="radio"
					name="timeKind"
					value="period"
					checked={timeKind === 'period'}
					onchange={() => (chosen.timeKind = 'period')}
				/>時限で決める
			</label>
		</div>
		{#if timeKind === 'time'}
			<div class="row">
				<label class="field">
					始まり
					<input type="time" name="startTime" required value={values.startTime} />
				</label>
				<label class="field">
					終わり
					<input type="time" name="endTime" required value={values.endTime} />
				</label>
			</div>
		{:else if timeKind === 'period'}
			<div class="row">
				<label class="field">
					始まりの時限
					<select name="startPeriod" value={values.startPeriod}>
						{#each PERIODS as period (period)}
							<option value={String(period)}>{period} 限</option>
						{/each}
					</select>
				</label>
				<label class="field">
					終わりの時限
					<select name="endPeriod" value={values.endPeriod}>
						{#each PERIODS as period (period)}
							<option value={String(period)}>{period} 限</option>
						{/each}
					</select>
				</label>
			</div>
		{/if}
		<p class="hint">数日にわたる予定は、終日だけ選べます。</p>
	</fieldset>

	<fieldset>
		<legend>繰り返し</legend>
		<label class="field">
			繰り返しの種類
			<select
				name="repeat"
				value={repeat}
				onchange={(event) => (chosen.repeat = event.currentTarget.value)}
			>
				<option value="none">繰り返さない</option>
				<option value="daily">毎日</option>
				<option value="weekly">毎週</option>
				<option value="monthly">毎月</option>
				<option value="yearly">毎年</option>
			</select>
		</label>

		{#if repeat !== 'none'}
			<label class="field narrow">
				間隔 (何{UNITS[repeat]}ごとか)
				<input type="number" name="interval" min="1" max="99" required value={values.interval} />
			</label>

			{#if repeat === 'weekly'}
				<fieldset class="inner">
					<legend>曜日 (選ばなければ、開始日の曜日)</legend>
					<div class="choices">
						{#each WEEKDAYS as weekday (weekday.value)}
							<label class="choice">
								<input
									type="checkbox"
									name="weekday"
									value={weekday.value}
									checked={values.weekdays.includes(weekday.value)}
								/>{weekday.label}
							</label>
						{/each}
					</div>
				</fieldset>
			{:else if repeat === 'monthly'}
				<fieldset class="inner">
					<legend>毎月の決め方</legend>
					<label class="choice">
						<input
							type="radio"
							name="monthlyMode"
							value="day"
							checked={values.monthlyMode === 'day'}
						/>開始日と同じ日付
					</label>
					<label class="choice">
						<input
							type="radio"
							name="monthlyMode"
							value="nth"
							checked={values.monthlyMode === 'nth'}
						/>開始日と同じ、第何曜日 (例: 第 2 火曜日)
					</label>
					<label class="choice">
						<input
							type="radio"
							name="monthlyMode"
							value="last"
							checked={values.monthlyMode === 'last'}
						/>開始日と同じ曜日の、最終週
					</label>
				</fieldset>
			{/if}

			<fieldset class="inner">
				<legend>終わり</legend>
				<label class="choice">
					<input
						type="radio"
						name="endKind"
						value="never"
						checked={endKind === 'never'}
						onchange={() => (chosen.endKind = 'never')}
					/>終わりなし
				</label>
				<label class="choice">
					<input
						type="radio"
						name="endKind"
						value="until"
						checked={endKind === 'until'}
						onchange={() => (chosen.endKind = 'until')}
					/>日付まで
				</label>
				<label class="choice">
					<input
						type="radio"
						name="endKind"
						value="count"
						checked={endKind === 'count'}
						onchange={() => (chosen.endKind = 'count')}
					/>回数まで
				</label>
				{#if endKind === 'until'}
					<label class="field narrow">
						終わりの日
						<input type="date" name="untilDate" required value={values.untilDate} />
					</label>
				{:else if endKind === 'count'}
					<label class="field narrow">
						繰り返す回数
						<input type="number" name="count" min="1" max="999" required value={values.count} />
					</label>
				{/if}
			</fieldset>

			{#if candidates.length > 0}
				<fieldset class="inner">
					<legend>この日は除く</legend>
					<div class="excludes">
						{#each candidates as candidate (candidate.date)}
							<label class="choice">
								<input
									type="checkbox"
									name="exclude"
									value={candidate.date}
									checked={values.excludedDates.includes(candidate.date)}
								/>{candidate.label}
							</label>
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
		<label class="choice">
			<input
				type="radio"
				name="visibility"
				value="private"
				checked={values.visibility === 'private'}
			/>自分だけ
		</label>
		<label class="choice">
			<input type="radio" name="visibility" value="link" checked={values.visibility === 'link'} />
			共有のリンクを知っている人 (Funmary にログインした人だけ)
		</label>
		<label class="choice">
			<input
				type="radio"
				name="visibility"
				value="public"
				checked={values.visibility === 'public'}
			/>Funmary にログインしている全員 (「みんなの予定」に載る)
		</label>
		<p class="hint">
			公開した予定に、あなたの名前やメールアドレスは出ません。公開をやめると、ほかの人の時間割から消えます。
		</p>
	</fieldset>

	<Button type="submit" variant="unelevated"><Label>{submitLabel}</Label></Button>
</form>

<style lang="scss">
	@use 'mixins';

	.event-form {
		@include mixins.stack(1rem);
		max-width: 40rem;
	}
	fieldset {
		@include mixins.stack(0.5rem);
		margin: 0;
		padding: 0.75rem 1rem;
		border: 1px solid var(--fm-divider);
		border-radius: 0.5rem;
	}
	fieldset.inner {
		margin-top: 0.5rem;
	}
	legend {
		padding: 0 0.25rem;
		font-weight: 500;
	}
	.field {
		@include mixins.stack(0.25rem);
		font-size: 0.875rem;
	}
	.field.narrow {
		max-width: 12rem;
	}
	.row {
		@include mixins.wrap-row(0.5rem 1rem);
	}
	.choices {
		@include mixins.wrap-row(0.25rem 1rem);
	}
	.choice {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
	}
	.excludes {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
		gap: 0 1rem;
	}
	.hint {
		margin: 0;
		color: var(--fm-text-muted);
		font-size: 0.875rem;
	}
	/* gap で間隔を取る親の中なので、<p> の既定の margin を消す */
	.event-form :global(.notice) {
		margin: 0;
	}
</style>
