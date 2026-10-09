<script lang="ts">
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import { DEFAULT_PERIODS, TERMS } from '@funmary/core';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import { resolve } from '$app/paths';
	import { formatSlot, formatTerm, WEEKDAY_LABELS } from '#lib/term-label.ts';

	interface SubjectView {
		academicYear: number;
		name: string;
		teacher: string | null;
		credits: number | null;
		term: string;
		attributes: [string, string][];
		syllabus: [string, string][];
		syllabusUrl: string | null;
		userAdded: boolean;
		visibility: 'public' | 'link' | 'private';
	}
	interface ChangeView {
		key: string;
		date: string;
		period: number;
		status: 'cancelled' | 'makeup' | 'roomChanged';
		detail: string | null;
		comment: string | null;
		withdrawn: boolean;
	}

	interface Slot {
		weekday: number;
		period: number;
		room: string | null;
	}

	let {
		data,
		form,
	}: {
		form: { error?: string; message?: string } | null;
		data: {
			abbreviation: string;
			canEdit: boolean;
			subject: SubjectView;
			slots: Slot[];
			personalSlots: Slot[];
			slotSharingMode: 'open' | 'moderated' | 'closed';
			registered: boolean;
			hopeCourseUrl: string | null;
			changes: ChangeView[];
			grantedEmails: string[];
		};
	} = $props();

	/** これより長い項目は、折りたたんで出す */
	const LONG_SECTION = 200;

	const VISIBILITY_LABELS = {
		public: '全体公開 (誰でも「科目を探す」から見つけられます)',
		link: '限定公開 (この URL を知っている人だけが見られます)',
		private: '非公開 (足した人と管理者だけが見られます)',
	} as const;
</script>

<svelte:head>
	<title>{data.subject.name} - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page page-w-40">
	<p><a href={resolve('app/courses')}>科目</a></p>
	<h1>{data.subject.name}</h1>
	{#if data.subject.userAdded}
		<p class="note">
			公開シラバスにない授業です。利用者が足しました。{#if data.subject.visibility !== 'public'}
				{VISIBILITY_LABELS[data.subject.visibility]}になっています。{/if}
		</p>
	{/if}

	<FormNotice error={form?.error} message={form?.message} />

	<dl class="summary">
		<dt>教員</dt>
		<dd>{data.subject.teacher ?? '不明'}</dd>
		<dt>学期</dt>
		<dd>{data.subject.academicYear} 年度 {formatTerm(data.subject.term)}</dd>
		<dt>単位数</dt>
		<dd>{data.subject.credits === null ? '不明' : `${data.subject.credits} 単位`}</dd>
		<dt>曜日と時限</dt>
		<dd>
			{#if data.slots.length === 0}
				まだ登録されていません
			{:else}
				<ul>
					{#each data.slots as slot (`${slot.weekday}-${slot.period}`)}
						<li>{formatSlot(slot)}、{slot.room ?? '教室は未登録'}</li>
					{/each}
				</ul>
			{/if}
		</dd>
	</dl>

	{#if data.personalSlots.length > 0}
		<section aria-labelledby="personal-slots-heading">
			<h2 id="personal-slots-heading">自分だけの曜日と時限</h2>
			<p class="note">ほかの利用者には見えず、自分の時間割にだけ使われます。</p>
			<ul>
				{#each data.personalSlots as slot (`${slot.weekday}-${slot.period}`)}
					<li>
						{formatSlot(slot)}、{slot.room ?? '教室は未登録'}
						<form method="POST" action="?/removePersonalSlot" use:enhance class="inline">
							<input type="hidden" name="weekday" value={slot.weekday} />
							<input type="hidden" name="period" value={slot.period} />
							<Button type="submit" variant="outlined"
								><Label>消す<span class="visually-hidden">: {formatSlot(slot)}</span></Label
								></Button
							>
						</form>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<details>
		<summary>略称を編集する</summary>
		<form method="POST" action="?/saveAbbreviation" use:enhance class="edit">
			<label>
				略称名
				<input
					name="abbreviation"
					value={data.abbreviation}
					maxlength="100"
					autocomplete="off"
					aria-describedby="abbreviation-help"
				/>
			</label>
			<Button type="submit" variant="unelevated"><Label>保存する</Label></Button>
		</form>
		<p class="note" id="abbreviation-help">
			自分の時間割で略称表示をオンにしたときだけ使われます。ほかの利用者には共有されません。空欄で保存すると正式名称を表示します。
		</p>
	</details>

	{#if data.slotSharingMode !== 'closed'}
		<details>
			<summary>曜日と時限を足す</summary>
			<form method="POST" action="?/addSlot" use:enhance class="edit">
				<label>
					曜日
					<select name="weekday" required>
						{#each WEEKDAY_LABELS as day (day.weekday)}
							<option value={day.weekday}>{day.label}曜</option>
						{/each}
					</select>
				</label>
				<label>
					時限
					<select name="period" required>
						{#each DEFAULT_PERIODS as period (period.number)}
							<option value={period.number}>{period.number} 限</option>
						{/each}
					</select>
				</label>
				<label>
					教室 (分からなければ空のまま)
					<input name="room" maxlength="100" autocomplete="off" />
				</label>
				<Button type="submit" variant="unelevated"><Label>登録する</Label></Button>
			</form>
			<p class="note">
				{#if data.slotSharingMode === 'moderated'}
					曜日、時限、教室は、大学から自動では取得できないため、利用者どうしで登録しています。履修科目に登録していなくても足せます。モデレーターか管理者が確かめてから登録され、この科目を履修しているほかの利用者の時間割にも使われます。
				{:else}
					曜日、時限、教室は、大学から自動では取得できないため、利用者どうしで登録しています。履修科目に登録していなくても足せ、登録した内容は、この科目を履修しているほかの利用者の時間割にも使われます。
				{/if}
			</p>
		</details>
	{/if}

	<details>
		<summary>自分だけに使う曜日と時限を足す</summary>
		<form method="POST" action="?/addPersonalSlot" use:enhance class="edit">
			<label>
				曜日
				<select name="weekday" required>
					{#each WEEKDAY_LABELS as day (day.weekday)}
						<option value={day.weekday}>{day.label}曜</option>
					{/each}
				</select>
			</label>
			<label>
				時限
				<select name="period" required>
					{#each DEFAULT_PERIODS as period (period.number)}
						<option value={period.number}>{period.number} 限</option>
					{/each}
				</select>
			</label>
			<label>
				教室 (分からなければ空のまま)
				<input name="room" maxlength="100" autocomplete="off" />
			</label>
			<Button type="submit" variant="unelevated"><Label>登録する</Label></Button>
		</form>
		<p class="note">
			ほかの利用者には見えず、自分の時間割にだけ使われます。共有の登録が確認待ちや、できない設定のときにも使えます。
		</p>
	</details>

	{#if !data.registered}
		<p>この科目は、履修科目に登録していません。</p>
	{/if}

	<ul class="links">
		{#if data.subject.syllabusUrl}
			<!-- 大学のサイトへのリンク。サーバーが https のものだけを渡す -->
			<li>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={data.subject.syllabusUrl} target="_blank" rel="noopener noreferrer"
					>シラバスの原文 (大学のサイト)</a
				>
			</li>
		{/if}
		{#if data.hopeCourseUrl}
			<li>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={data.hopeCourseUrl} target="_blank" rel="noopener noreferrer">HOPE のコース</a>
			</li>
		{/if}
	</ul>

	{#if data.canEdit}
		<section aria-labelledby="edit-heading">
			<h2 id="edit-heading">この授業を直す</h2>
			<p class="note">足した人と管理者だけが直したり消したりできます。</p>
			<form method="POST" action="?/updateSubject" use:enhance class="edit">
				<label>
					授業の名前
					<input name="name" maxlength="100" required value={data.subject.name} />
				</label>
				<label>
					学期
					<select name="term" required value={data.subject.term}>
						{#each TERMS as term (term)}
							<option value={term}>{formatTerm(term)}</option>
						{/each}
					</select>
				</label>
				<label>
					教員 (任意)
					<input name="teacher" maxlength="100" value={data.subject.teacher ?? ''} />
				</label>
				<Button type="submit" variant="unelevated"><Label>直す</Label></Button>
			</form>
			<form method="POST" action="?/setVisibility" use:enhance class="edit visibility">
				<fieldset>
					<legend>公開範囲</legend>
					{#each Object.entries(VISIBILITY_LABELS) as [value, label] (value)}
						<label class="radio">
							<input
								type="radio"
								name="visibility"
								{value}
								checked={data.subject.visibility === value}
							/>
							{label}
						</label>
					{/each}
				</fieldset>
				<Button type="submit" variant="outlined"><Label>公開範囲を変える</Label></Button>
			</form>
			{#if data.subject.visibility === 'private'}
				<div class="edit invite">
					<h3>特定の人にだけ見せる</h3>
					<p class="note">
						メールアドレスで招待した人は、非公開のままでもこの授業を見られます。そのメールアドレスが
						Funmary
						に登録されているかどうかにかかわらず、同じ案内を出します。自動では時間割に加わりません。
					</p>
					<form method="POST" action="?/grantAccess" use:enhance class="grant-form">
						<label>
							メールアドレス
							<input type="email" name="email" maxlength="200" required autocomplete="off" />
						</label>
						<Button type="submit" variant="outlined"><Label>招待する</Label></Button>
					</form>
					{#if data.grantedEmails.length > 0}
						<ul class="grants">
							{#each data.grantedEmails as email (email)}
								<li>
									<span>{email}</span>
									<form method="POST" action="?/revokeAccess" use:enhance class="inline">
										<input type="hidden" name="email" value={email} />
										<Button type="submit" variant="outlined"
											><Label>外す<span class="visually-hidden">: {email}</span></Label></Button
										>
									</form>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
			<details>
				<summary>この授業を消す</summary>
				<form method="POST" action="?/deleteSubject" use:enhance class="edit">
					<label class="confirm">
						<input type="checkbox" name="confirm" required />
						ほかの利用者の履修登録と、曜日と時限も消え、元に戻せないことを確かめました
					</label>
					<Button type="submit" variant="outlined"><Label>消す</Label></Button>
				</form>
			</details>
		</section>
	{/if}

	<section aria-labelledby="changes-heading">
		<h2 id="changes-heading">休講、補講、教室変更</h2>
		{#if data.changes.length === 0}
			<p>ありません。</p>
		{:else}
			<ul class="changes">
				{#each data.changes as change (change.key)}
					<li class={{ withdrawn: change.withdrawn }}>
						<StatusBadge status={change.status} />
						{change.date}
						{change.period} 限{#if change.detail}、{change.detail}{/if}
						{#if change.withdrawn}(取り消されました){/if}
						{#if change.comment}<p class="comment">{change.comment}</p>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if data.subject.attributes.length > 0}
		<section aria-labelledby="attributes-heading">
			<h2 id="attributes-heading">科目の情報</h2>
			<dl class="attributes">
				{#each data.subject.attributes as [label, value] (label)}
					<dt>{label}</dt>
					<dd>{value}</dd>
				{/each}
			</dl>
		</section>
	{/if}

	<section aria-labelledby="syllabus-heading">
		<h2 id="syllabus-heading">シラバス</h2>
		{#if data.subject.syllabus.length === 0}
			<p>シラバスの内容は、まだ取り込まれていません。</p>
		{:else}
			{#each data.subject.syllabus as [label, text] (label)}
				<details open={text.length <= LONG_SECTION}>
					<summary>{label}</summary>
					<p class="section">{text}</p>
				</details>
			{/each}
		{/if}
	</section>
</div>

<style lang="scss">
	@use 'mixins';

	.note {
		color: var(--fm-text-muted);
		font-size: 0.875rem;
	}

	.inline {
		display: inline;
		margin-left: 0.5rem;
	}

	.edit {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.75rem 1rem;
		margin: 0.5rem 0;
		padding: 1rem;
		border-radius: 0.75rem;
		background: var(--fm-surface-muted);

		label {
			@include mixins.stack(0.25rem);
			font-size: 0.875rem;
		}

		.confirm {
			flex-direction: row;
			align-items: center;
			gap: 0.5rem;
			min-height: 44px;
		}
	}

	.visibility {
		flex-direction: column;
		align-items: flex-start;

		fieldset {
			@include mixins.stack(0.25rem);
			width: 100%;
			margin: 0;
			padding: 0;
			border: none;
		}

		legend {
			padding: 0;
			font-size: 0.875rem;
			color: var(--fm-text-muted);
		}

		.radio {
			flex-direction: row;
			align-items: center;
			gap: 0.5rem;
			min-height: 44px;
		}
	}

	.invite {
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;

		h3 {
			margin: 0;
			font-size: 1rem;
		}
	}

	.grant-form {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.5rem 1rem;
		width: 100%;

		label {
			display: flex;
			flex: 1 1 14rem;
			flex-direction: column;
			gap: 0.25rem;
			font-size: 0.875rem;
		}
	}

	.grants {
		display: grid;
		gap: 0.25rem;
		width: 100%;
		margin: 0;
		padding: 0;
		list-style: none;

		li {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			justify-content: space-between;
			gap: 0.5rem;
			padding: 0.5rem 0.75rem;
			border-radius: 0.5rem;
			background: var(--fm-surface);
			overflow-wrap: anywhere;
		}
	}

	summary {
		min-height: 44px;
		align-content: center;
		cursor: pointer;
	}

	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.25rem 1rem;
	}
	dt {
		color: var(--fm-text-muted);
	}
	dd {
		margin: 0;
	}
	dd ul {
		margin: 0;
		padding-left: 1.25rem;
	}
	.changes {
		padding: 0;
		list-style: none;
	}
	.changes li {
		margin: 0.5rem 0;
	}
	.withdrawn {
		color: var(--fm-text-muted);
	}
	.comment,
	.section {
		margin: 0.25rem 0 0.75rem;
		white-space: pre-line;
	}
	summary {
		min-height: 48px;
		display: flex;
		align-items: center;
		cursor: pointer;
		font-weight: bold;
	}
	summary::before {
		content: '▸';
		margin-right: 0.5rem;
	}
	details[open] > summary::before {
		content: '▾';
	}
</style>
