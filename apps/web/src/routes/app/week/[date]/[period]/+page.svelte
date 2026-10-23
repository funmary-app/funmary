<script lang="ts">
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { DayNote } from '@funmary/api';
	import { confirmSubmit } from '#lib/actions/confirm-submit.ts';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import SelectField from '#lib/components/SelectField.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import TextField from '#lib/components/TextField.svelte';
	import type { LessonView } from '#lib/server/lesson-view.ts';
	import type { SubjectPathParams } from '#lib/subject-path.ts';
	import { formatSlot } from '#lib/term-label.ts';
	import { formatDate, formatDayNote } from '#lib/timetable-label.ts';

	let {
		data,
		form,
	}: {
		data: {
			date: string;
			period: number;
			/** このコマの曜日。振替授業日は、その日に行う曜日 */
			weekday: number;
			note: DayNote | null;
			registered: {
				id: number;
				name: string;
				path: SubjectPathParams;
				status: LessonView['status'];
				/** 自分だけの曜日と時限で、このコマに出ている */
				personal: boolean;
			}[];
			candidates: {
				id: number;
				name: string;
				teacher: string | null;
				path: SubjectPathParams;
				rooms: string[];
			}[];
			others: { id: number; name: string }[];
		};
		form: { error?: string; message?: string } | null;
	} = $props();

	const slot = $derived(formatSlot({ weekday: data.weekday, period: data.period }));
	// 自分だけの曜日と時限は、月曜から土曜まで
	const canAddPersonal = $derived(data.weekday <= 6 && data.others.length > 0);
</script>

<svelte:head>
	<title>{formatDate(data.date)} {data.period} 限 - Funmary</title>
</svelte:head>

<div class="page">
	<h1>{formatDate(data.date)} {data.period} 限</h1>
	<p>
		<a href={resolve(`app/week?date=${data.date}`)}>時間割に戻る</a>
	</p>
	{#if data.note}
		<p class="note">{formatDayNote(data.note)}</p>
	{/if}

	<FormNotice error={form?.error} message={form?.message} />

	<section aria-labelledby="registered-heading">
		<h2 id="registered-heading">登録した科目</h2>
		{#if data.registered.length === 0}
			<p>このコマに登録した科目はありません。</p>
		{:else}
			<ul class="subjects">
				{#each data.registered as subject (subject.id)}
					<li>
						<h3>
							<a href={resolve('/app/subjects/[year]/[code]', subject.path)}>{subject.name}</a>
							<StatusBadge status={subject.status} />
						</h3>
						<p class="meta">
							{subject.personal
								? `自分だけに使う曜日と時限 (${slot}) で出ています。`
								: '曜日と時限の誤りは、科目の画面から直せます。'}
						</p>
						<div class="actions">
							{#if subject.personal}
								<form method="POST" action="?/removePersonalSlot" use:enhance>
									<input type="hidden" name="subjectId" value={subject.id} />
									<input type="hidden" name="weekday" value={data.weekday} />
									<input type="hidden" name="period" value={data.period} />
									<Button type="submit" variant="outlined"><Label>このコマから外す</Label></Button>
								</form>
							{/if}
							<form
								method="POST"
								action="?/unregister"
								use:confirmSubmit={'履修登録を取り消します。よろしいですか?'}
								use:enhance
							>
								<input type="hidden" name="subjectId" value={subject.id} />
								<Button type="submit" variant="outlined"><Label>登録を取り消す</Label></Button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section aria-labelledby="candidates-heading">
		<h2 id="candidates-heading">このコマの科目を登録する</h2>
		{#if data.candidates.length === 0}
			<p>{slot}に曜日と時限が登録されている科目で、まだ登録していないものはありません。</p>
		{:else}
			<p class="muted">{slot}に曜日と時限が登録されている、この日の学期の科目です。</p>
			<ul class="subjects">
				{#each data.candidates as subject (subject.id)}
					<li>
						<h3>
							<a href={resolve('/app/subjects/[year]/[code]', subject.path)}>{subject.name}</a>
						</h3>
						{#if subject.teacher || subject.rooms.length > 0}
							<p class="meta">
								{[subject.teacher, ...subject.rooms.map((room) => `教室 ${room}`)]
									.filter(Boolean)
									.join('、')}
							</p>
						{/if}
						<form method="POST" action="?/register" use:enhance>
							<input type="hidden" name="subjectId" value={subject.id} />
							<Button type="submit" variant="unelevated"><Label>登録する</Label></Button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
		<p>
			見つからない科目は、<a href={resolve('app/courses?tab=search')}>科目を探す</a
			>から登録できます。
		</p>
	</section>

	{#if canAddPersonal}
		<section aria-labelledby="personal-heading">
			<h2 id="personal-heading">登録した科目をこのコマに足す</h2>
			<form method="POST" action="?/addPersonalSlot" use:enhance class="personal-form">
				<input type="hidden" name="weekday" value={data.weekday} />
				<input type="hidden" name="period" value={data.period} />
				<SelectField label="科目" name="subjectId" required>
					{#each data.others as subject (subject.id)}
						<option value={subject.id}>{subject.name}</option>
					{/each}
				</SelectField>
				<TextField label="教室 (任意)" name="room" maxlength={100} autocomplete="off" />
				<Button type="submit" variant="unelevated"><Label>足す</Label></Button>
			</form>
			<p class="note">
				自分だけに使う曜日と時限として足します。ほかの利用者には見えません。自分だけの曜日と時限を登録した科目は、共有の曜日と時限の代わりに、自分だけのものを使います。
			</p>
		</section>
	{/if}
</div>

<style lang="scss">
	@use 'mixins';
	@use 'surfaces';

	.subjects {
		padding: 0;
		list-style: none;
	}
	.subjects > li {
		@include surfaces.outlined;
	}
	h3 {
		margin: 0;
		font-size: 1.05rem;
	}
	.meta {
		margin: 0;
		color: var(--fm-text-muted);
	}
	.actions,
	.personal-form {
		@include mixins.wrap-row(0.5rem 1rem);
		align-items: end;
	}
	.note {
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		background: var(--fm-surface-muted);
	}
</style>
