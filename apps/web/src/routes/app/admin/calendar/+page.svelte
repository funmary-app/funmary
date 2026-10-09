<script lang="ts">
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { confirmSubmit } from '#lib/actions/confirm-submit.ts';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import YearCalendar from '#lib/components/YearCalendar.svelte';
	import { formatTerm, WEEKDAY_LABELS } from '#lib/term-label.ts';
	import { formatDate } from '#lib/timetable-label.ts';
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';

	type Source = 'manual' | 'auto' | 'estimated';

	interface TermRow {
		term: string;
		start: string | null;
		end: string | null;
		source: Source | null;
	}

	let {
		data,
		form,
	}: {
		data: {
			academicYear: number;
			range: { start: string; end: string };
			terms: TermRow[];
			substituteDays: { date: string; weekday: number }[];
			noClassDays: { date: string; label: string | null }[];
			holidays: { date: string; name: string }[];
			today: string;
		};
		form: {
			error?: string;
			message?: string;
			pdfPreview?: {
				id: string;
				academicYear: number;
				terms: { term: string; start: string; end: string }[];
				substituteDays: { date: string; weekday: number }[];
				noClassDays: { date: string; label: string | null }[];
				warnings: string[];
			};
		} | null;
	} = $props();

	let reading = $state(false);

	const SOURCE_LABELS: Record<Source, string> = {
		manual: '手入力',
		auto: '学年暦から自動',
		estimated: '推定',
	};

	/** クォーターの期間がなければ、それを含む前期か後期の期間を使う */
	const QUARTER_OF: Record<string, string> = { q1: '前期', q2: '前期', q3: '後期', q4: '後期' };

	function sourceLabel(row: TermRow): string {
		if (row.source === null) return '未入力';
		const quarter = QUARTER_OF[row.term];
		if (row.source === 'estimated' && quarter) return `${quarter}と同じ期間`;
		return SOURCE_LABELS[row.source];
	}

	const weekdayName = (weekday: number) =>
		WEEKDAY_LABELS.find((day) => day.weekday === weekday)?.label ?? '?';
	const yearUrl = (year: number) => `${resolve('app/admin/calendar')}?year=${year}`;
</script>

<svelte:head>
	<title>学年暦 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page page-w-64">
	<SettingsBreadcrumb current="学年暦" />
	<h1>{data.academicYear} 年度の学年暦</h1>

	<nav aria-label="年度の切り替え" class="years">
		<!-- eslint-disable svelte/no-navigation-without-resolve -- resolve した /admin/calendar に、年度を足している -->
		<a href={yearUrl(data.academicYear - 1)}>{data.academicYear - 1} 年度</a>
		<a href={yearUrl(data.academicYear + 1)}>{data.academicYear + 1} 年度</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</nav>

	<p>
		大学の学年暦 (PDF)
		を見て入れます。入れていない前期と後期は、既定の規則で推定した期間を使います。1Q から 4Q
		は、入れていなければ前期か後期と同じ期間を使います。
	</p>

	<FormNotice error={form?.error} message={form?.message} />

	<section aria-labelledby="pdf-heading">
		<h2 id="pdf-heading">PDF から取り込む</h2>
		<p class="muted">
			大学の公式サイトの「教育に関する情報」にある学年暦の PDF
			を選ぶと、読み取った内容を確かめてから取り込めます。手で入れた値は上書きしません。
		</p>
		<form
			method="POST"
			action="?/previewPdf"
			enctype="multipart/form-data"
			use:enhance={() => {
				reading = true;
				return async ({ update }) => {
					await update();
					reading = false;
				};
			}}
			class="entry"
		>
			<label>
				学年暦の PDF
				<input type="file" name="pdf" accept="application/pdf,.pdf" required />
			</label>
			<Button type="submit" variant="unelevated" disabled={reading}>
				<Label>{reading ? '読み取っています' : '読み取る'}</Label>
			</Button>
		</form>

		{#if form?.pdfPreview}
			{@const pdf = form.pdfPreview}
			<div class="preview" aria-labelledby="preview-heading" role="region">
				<h3 id="preview-heading">{pdf.academicYear} 年度の学年暦 (PDF から読んだ内容)</h3>
				{#if pdf.academicYear !== data.academicYear}
					<p class="muted">
						いま開いている {data.academicYear} 年度とは違う年度です。取り込むと、{pdf.academicYear}
						年度の画面に移ります。
					</p>
				{/if}
				{#if pdf.warnings.length > 0}
					<div class="warnings">
						<p>読み取りに警告があります。PDF と見比べて、内容を確かめてください。</p>
						<ul>
							{#each pdf.warnings as warning, i (i)}<li>{warning}</li>{/each}
						</ul>
					</div>
				{/if}
				<h4>学期の期間</h4>
				<ul class="plain">
					{#each pdf.terms as term, i (i)}
						<li>
							{formatTerm(term.term)}: <span class="numeric">{term.start} から {term.end}</span>
						</li>
					{:else}
						<li>(なし)</li>
					{/each}
				</ul>
				<h4>振替授業日</h4>
				<ul class="plain">
					{#each pdf.substituteDays as day, i (i)}
						<li>
							<time datetime={day.date}>{formatDate(day.date)}</time> は {weekdayName(
								day.weekday,
							)}曜の授業
						</li>
					{:else}
						<li>(なし)</li>
					{/each}
				</ul>
				<h4>全学の休講日 (祝日を除く)</h4>
				<ul class="plain">
					{#each pdf.noClassDays as day, i (i)}
						<li>
							<time datetime={day.date}>{formatDate(day.date)}</time>{day.label
								? ` (${day.label})`
								: ''}
						</li>
					{:else}
						<li>(なし)</li>
					{/each}
				</ul>
				<!-- 取り込んだ年度の画面を開き直すので、enhance を使わずに送る -->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve した /admin/calendar に、年度と処理を足している -->
				<form
					method="POST"
					action="{resolve('app/admin/calendar')}?year={pdf.academicYear}&/applyPdf"
					class="apply"
				>
					<input type="hidden" name="id" value={pdf.id} />
					{#if pdf.warnings.length > 0}
						<label class="confirm">
							<input type="checkbox" name="confirmWarnings" required />
							警告の内容を確かめました
						</label>
					{/if}
					<Button type="submit" variant="unelevated"><Label>この内容で取り込む</Label></Button>
				</form>
			</div>
		{/if}
	</section>

	<section aria-labelledby="year-heading">
		<h2 id="year-heading">1 年の暦</h2>
		<p class="muted">
			日を押すと、振替授業日や全学の休講日にしたり、学期の始まりや終わりにしたりできます。矢印キーで日を移れます。
		</p>
		<YearCalendar
			academicYear={data.academicYear}
			today={data.today}
			input={{
				terms: data.terms,
				holidays: data.holidays,
				substituteDays: data.substituteDays,
				noClassDays: data.noClassDays,
			}}
		/>
	</section>

	<section aria-labelledby="terms-heading">
		<h2 id="terms-heading">学期の期間</h2>
		<table>
			<thead>
				<tr>
					<th scope="col">学期</th>
					<th scope="col">期間と出どころ</th>
					<th scope="col"><span class="visually-hidden">操作</span></th>
				</tr>
			</thead>
			<tbody>
				{#each data.terms as row (row.term)}
					<tr class={{ estimated: row.source === 'estimated' || row.source === null }}>
						<th scope="row">{formatTerm(row.term)}</th>
						<td>
							<span class="numeric">
								{#if row.start && row.end}{row.start} から {row.end}{:else}-{/if}
							</span>
							<span class="source">{sourceLabel(row)}</span>
						</td>
						<td>
							{#if row.source === 'manual' || row.source === 'auto'}
								<form
									method="POST"
									action="?/deleteTerm"
									use:confirmSubmit={`${formatTerm(row.term)}の期間を消します。よろしいですか?`}
									use:enhance
								>
									<input type="hidden" name="term" value={row.term} />
									<Button type="submit" variant="outlined">
										<Label>消す<span class="visually-hidden">: {formatTerm(row.term)}</span></Label>
									</Button>
								</form>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<details>
			<summary>日付を入れて学期の期間を入力する</summary>
			<form method="POST" action="?/saveTerm" use:enhance class="entry">
				<label>
					学期
					<select name="term" required>
						{#each data.terms as row (row.term)}
							<option value={row.term}>{formatTerm(row.term)}</option>
						{/each}
					</select>
				</label>
				<label>
					始まりの日
					<input type="date" name="start" min={data.range.start} max={data.range.end} required />
				</label>
				<label>
					終わりの日 (最後の授業日)
					<input type="date" name="end" min={data.range.start} max={data.range.end} required />
				</label>
				<Button type="submit" variant="unelevated"><Label>学期の期間を保存する</Label></Button>
			</form>
		</details>
	</section>

	<section aria-labelledby="substitute-heading">
		<h2 id="substitute-heading">振替授業日</h2>
		<p class="muted">
			その日は、指定した曜日の授業を行います。祝日でも授業を行う日も、ここに入れます。
		</p>
		{#if data.substituteDays.length === 0}
			<p>ありません。</p>
		{:else}
			<ul class="days">
				{#each data.substituteDays as day (day.date)}
					<li>
						<span
							><time datetime={day.date}>{formatDate(day.date)}</time> は {weekdayName(
								day.weekday,
							)}曜の授業</span
						>
						<form
							method="POST"
							action="?/deleteSubstituteDay"
							use:confirmSubmit={`${formatDate(day.date)}の振替授業日を消します。よろしいですか?`}
							use:enhance
						>
							<input type="hidden" name="date" value={day.date} />
							<Button type="submit" variant="outlined">
								<Label>消す<span class="visually-hidden">: {formatDate(day.date)}</span></Label>
							</Button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
		<details>
			<summary>日付を入れて振替授業日を入力する</summary>
			<form method="POST" action="?/saveSubstituteDay" use:enhance class="entry">
				<label>
					日付
					<input type="date" name="date" min={data.range.start} max={data.range.end} required />
				</label>
				<label>
					行う授業の曜日
					<select name="weekday" required>
						{#each WEEKDAY_LABELS as day (day.weekday)}
							<option value={day.weekday}>{day.label}曜</option>
						{/each}
					</select>
				</label>
				<Button type="submit" variant="unelevated"><Label>振替授業日を保存する</Label></Button>
			</form>
		</details>
	</section>

	<section aria-labelledby="no-class-heading">
		<h2 id="no-class-heading">全学の休講日</h2>
		<p class="muted">大学祭などで、全学の授業がない日です。</p>
		{#if data.noClassDays.length === 0}
			<p>ありません。</p>
		{:else}
			<ul class="days">
				{#each data.noClassDays as day (day.date)}
					<li>
						<span
							><time datetime={day.date}>{formatDate(day.date)}</time>{day.label
								? ` (${day.label})`
								: ''}</span
						>
						<form
							method="POST"
							action="?/deleteNoClassDay"
							use:confirmSubmit={`${formatDate(day.date)}の休講日を消します。よろしいですか?`}
							use:enhance
						>
							<input type="hidden" name="date" value={day.date} />
							<Button type="submit" variant="outlined">
								<Label>消す<span class="visually-hidden">: {formatDate(day.date)}</span></Label>
							</Button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
		<details>
			<summary>日付を入れて全学の休講日を入力する</summary>
			<form method="POST" action="?/saveNoClassDay" use:enhance class="entry">
				<label>
					日付
					<input type="date" name="date" min={data.range.start} max={data.range.end} required />
				</label>
				<label>
					行事名 (任意)
					<input type="text" name="label" maxlength="100" />
				</label>
				<Button type="submit" variant="unelevated"><Label>全学の休講日を保存する</Label></Button>
			</form>
		</details>
	</section>
</div>

<style lang="scss">
	@use 'mixins';

	details {
		margin-top: 1rem;
	}

	summary {
		min-height: 44px;
		align-content: center;
		font-size: 0.875rem;
		cursor: pointer;
	}

	.preview {
		margin-top: 1rem;
		padding: 1rem 1.25rem;
		border-radius: 0.75rem;
		background: var(--fm-primary-soft);

		h3 {
			margin-top: 0;
		}

		h4 {
			margin: 1rem 0 0.25rem;
			font-size: 0.9375rem;
		}
	}

	.plain {
		margin: 0;
		padding-left: 1.25rem;
	}

	.warnings {
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		background: var(--fm-surface-muted);
		color: var(--fm-error);

		p {
			margin: 0;
		}
	}

	.apply {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1rem;
		margin-top: 1rem;
	}

	.confirm {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
	}

	.years {
		display: flex;
		gap: 1.5rem;

		a {
			display: inline-block;
			min-height: 48px;
			line-height: 48px;
		}
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th,
	td {
		padding: 0.25rem 0.5rem;
		border-bottom: 1px dashed var(--fm-divider);
		text-align: left;
		vertical-align: middle;
	}

	thead th {
		color: var(--fm-text-muted);
		font-size: 0.875rem;
		font-weight: 400;
	}

	.estimated td {
		color: var(--fm-text-muted);
	}

	.source {
		display: block;
		color: var(--fm-text-muted);
		font-size: 0.8125rem;
	}

	tbody th {
		white-space: nowrap;
	}

	.entry {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.75rem 1rem;
		margin-top: 1rem;
		padding: 1rem;
		border-radius: 0.75rem;
		background: var(--fm-surface-muted);

		label {
			@include mixins.stack(0.25rem);
			font-size: 0.875rem;
		}
	}

	.days {
		margin: 0;
		padding: 0;
		list-style: none;

		li {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			justify-content: space-between;
			gap: 0.5rem;
			padding: 0.25rem 0;
			border-bottom: 1px dashed var(--fm-divider);
		}
	}
</style>
