<script lang="ts">
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { TERMS } from '@funmary/core';
	import { formatTerm } from '#lib/term-label.ts';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';

	interface Candidate {
		id: number;
		label: string;
	}

	interface Seen {
		lessonName: string;
		firstSeenAt: string;
		lastSeenAt: string;
	}

	interface UnresolvedLesson extends Seen {
		candidates: Candidate[];
	}

	interface ResolvedLesson extends UnresolvedLesson {
		subject: { name: string; path: { year: string; code: string }; independent: boolean };
	}

	let {
		data,
		form,
	}: {
		data: {
			academicYear: number | null;
			defaultTerm: string;
			lessons: UnresolvedLesson[];
			resolved: ResolvedLesson[];
			ignored: Seen[];
		};
		form: { error?: string; message?: string } | null;
	} = $props();

	const formatDate = (iso: string) =>
		new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
</script>

{#snippet seen(lesson: Seen)}
	<p class="meta">
		最初に見た時刻 {formatDate(lesson.firstSeenAt)}、最後に見た時刻 {formatDate(lesson.lastSeenAt)}
	</p>
{/snippet}

{#snippet nameForm(
	action: string,
	lessonName: string,
	label: string,
	variant: 'unelevated' | 'outlined',
)}
	<form method="POST" {action} use:enhance>
		<input type="hidden" name="lessonName" value={lessonName} />
		<Button type="submit" {variant}><Label>{label}</Label></Button>
	</form>
{/snippet}

{#snippet resolveForm(lesson: UnresolvedLesson, label: string)}
	<form method="POST" action="?/resolve" use:enhance>
		<input type="hidden" name="lessonName" value={lesson.lessonName} />
		<fieldset>
			<legend>紐付ける科目</legend>
			{#each lesson.candidates as candidate (candidate.id)}
				<label class="choice">
					<input type="radio" name="subjectId" value={candidate.id} />
					{candidate.label}
				</label>
			{:else}
				<p>似た名前の科目はありません。</p>
			{/each}
			<label>
				候補にないときは、シラバスの番号
				<input name="syllabusId" inputmode="numeric" autocomplete="off" />
			</label>
		</fieldset>
		<Button type="submit" variant="unelevated"><Label>{label}</Label></Button>
	</form>
{/snippet}

<svelte:head>
	<title>照合できなかった授業名 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page page-w-48">
	<SettingsBreadcrumb current="照合できなかった授業名" />
	<h1>照合できなかった授業名</h1>

	<FormNotice error={form?.error} message={form?.message} />

	{#if data.academicYear === null}
		<p>科目がまだ取り込まれていません。</p>
	{:else}
		{#if data.lessons.length === 0}
			<p>{data.academicYear} 年度には、照合できなかった授業名はありません。</p>
		{:else}
			<p>
				{data.academicYear}
				年度の科目に紐付けます。紐付けると、その名前の休講などにすぐ科目が入り、次の取得からも使われます。誤った科目に紐付けると、別の授業の休講を知らせてしまうので、確かめてから紐付けてください。公開シラバスにない授業は、科目を作って紐付けます。集会など、授業でないものは「科目にしない」で一覧から外せます。
			</p>
			<ul class="lessons">
				{#each data.lessons as lesson (lesson.lessonName)}
					<li>
						<h2>{lesson.lessonName}</h2>
						{@render seen(lesson)}
						{@render resolveForm(lesson, '紐付ける')}
						<details>
							<summary>シラバスにない授業として、科目を作って紐付ける</summary>
							<form method="POST" action="?/createSubject" use:enhance class="create">
								<input type="hidden" name="lessonName" value={lesson.lessonName} />
								<label>
									授業の名前
									<input name="name" maxlength="100" required value={lesson.lessonName} />
								</label>
								<label>
									学期
									<select name="term" required value={data.defaultTerm}>
										{#each TERMS as term (term)}
											<option value={term}>{formatTerm(term)}</option>
										{/each}
									</select>
								</label>
								<label>
									教員 (任意)
									<input name="teacher" maxlength="100" />
								</label>
								<Button type="submit" variant="outlined"><Label>作って紐付ける</Label></Button>
							</form>
						</details>
						{@render nameForm('?/ignore', lesson.lessonName, '科目にしない', 'outlined')}
					</li>
				{/each}
			</ul>
		{/if}

		{#if data.resolved.length > 0}
			<section aria-labelledby="resolved-heading">
				<h2 id="resolved-heading">紐付け済み</h2>
				<p>
					誤って紐付けたときは、付け替えるか、紐付けを外します。外すと、休講などに入れた科目も外れます。取り込み済みの曜日と時限は変わらないので、授業の詳細で直してください。
				</p>
				<ul class="lessons">
					{#each data.resolved as lesson (lesson.lessonName)}
						<li>
							<p class="name">{lesson.lessonName}</p>
							<p class="meta">
								紐付け先:
								<a href={resolve('/app/subjects/[year]/[code]', lesson.subject.path)}
									>{lesson.subject.name}</a
								>{lesson.subject.independent ? ' (シラバスにない授業)' : ''}
							</p>
							{@render seen(lesson)}
							<details>
								<summary>別の科目に付け替える</summary>
								{@render resolveForm(lesson, '付け替える')}
							</details>
							<div class="actions">
								{@render nameForm('?/unresolve', lesson.lessonName, '紐付けを外す', 'outlined')}
								{@render nameForm('?/ignore', lesson.lessonName, '科目にしない', 'outlined')}
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if data.ignored.length > 0}
			<section aria-labelledby="ignored-heading">
				<h2 id="ignored-heading">科目にしない</h2>
				<ul class="lessons">
					{#each data.ignored as lesson (lesson.lessonName)}
						<li>
							<p class="name">{lesson.lessonName}</p>
							{@render seen(lesson)}
							{@render nameForm('?/restore', lesson.lessonName, '一覧に戻す', 'outlined')}
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</div>

<style lang="scss">
	@use 'mixins';

	.lessons {
		padding: 0;
		list-style: none;
	}
	summary {
		min-height: 44px;
		align-content: center;
		cursor: pointer;
	}
	.create {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.5rem 1rem;

		label {
			@include mixins.stack(0.25rem);
			font-size: 0.875rem;
		}
	}
	.lessons > li {
		margin: 0.75rem 0;
		padding: 0.75rem 1rem;
		border: 1px solid var(--fm-divider);
		border-radius: 0.5rem;
	}
	h2 {
		margin: 0;
		font-size: 1.1rem;
	}
	section > h2 {
		margin-top: 2rem;
	}
	.actions {
		@include mixins.wrap-row(0.5rem);
	}
	.name {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 500;
	}
	.meta {
		margin: 0;
		color: var(--fm-text-muted);
	}
	fieldset {
		@include mixins.stack(0.25rem);
		border: none;
		padding: 0;
		margin: 0.5rem 0;
	}
	.choice {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 48px;
	}
</style>
