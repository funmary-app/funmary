<script lang="ts">
	import SelectField from '#lib/components/SelectField.svelte';
	import TextField from '#lib/components/TextField.svelte';
	import Tab, { Label as TabLabel } from '@smui/tab';
	import TabBar from '@smui/tab-bar';
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { confirmSubmit } from '#lib/actions/confirm-submit.ts';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import { TERMS } from '@funmary/core';
	import type { SubjectPathParams } from '#lib/subject-path.ts';
	import { formatSlot, formatTerm } from '#lib/term-label.ts';
	import SlotFields from '#lib/components/SlotFields.svelte';

	interface Slot {
		weekday: number;
		period: number;
		room: string | null;
	}
	interface RegisteredSubject {
		id: number;
		name: string;
		teacher: string | null;
		term: string;
		userAdded: boolean;
		/** 学期の期間が学年暦にないので、時間割に出ない */
		noPeriod: boolean;
		path: SubjectPathParams;
		slots: Slot[];
		/** 自分だけに使っている、共有ではない曜日と時限 */
		personalSlots: Slot[];
	}
	interface FoundSubject {
		id: number;
		name: string;
		teacher: string | null;
		term: string;
		userAdded: boolean;
		path: SubjectPathParams;
	}

	let {
		data,
		form,
	}: {
		data: {
			academicYear: number | null;
			registered: RegisteredSubject[];
			query: string;
			results: FoundSubject[];
			defaultTerm: string;
			slotSharingMode: 'open' | 'moderated' | 'closed';
		};
		form: { error?: string; message?: string } | null;
	} = $props();

	type CourseTab = 'registered' | 'search';
	const TABS: { id: CourseTab; label: string }[] = [
		{ id: 'registered', label: '登録した科目' },
		{ id: 'search', label: '科目を探す' },
	];

	// どちらのタブを開いているかは URL の tab= に持ち、再読み込みや戻る/進むでも保たれるようにする。
	// tab= がなければ、検索の結果があるとき (q= で来たとき) だけ「科目を探す」を開く
	const activeTab = $derived(
		(page.url.searchParams.get('tab') as CourseTab | null) ??
			(data.query.trim() !== '' ? 'search' : 'registered'),
	);

	function selectTab(tab: CourseTab) {
		if (tab === activeTab) return;
		const url = new URL(page.url.href);
		url.searchParams.set('tab', tab);
		void goto(url, { replace: true, reset: false });
	}
</script>

<svelte:head>
	<title>科目 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page page-w-40">
	<h1>科目</h1>

	<FormNotice error={form?.error} message={form?.message} />

	{#if data.academicYear === null}
		<p>まだシラバスを取り込んでいません。取り込みが済むまで、お待ちください。</p>
	{:else}
		<p>{data.academicYear} 年度の科目から登録します。</p>

		<TabBar
			tabs={TABS}
			key={(tab: (typeof TABS)[number]) => tab.id}
			active={TABS.find((tab) => tab.id === activeTab)}
			aria-label="科目"
			onSMUITabBarActivated={(event: CustomEvent<{ index: number }>) =>
				selectTab(TABS[event.detail.index]?.id ?? activeTab)}
		>
			{#snippet tab(tab: (typeof TABS)[number])}
				<Tab {tab} id="{tab.id}-tab" aria-controls="{tab.id}-panel">
					<TabLabel>{tab.label}</TabLabel>
				</Tab>
			{/snippet}
		</TabBar>

		<div
			id="registered-panel"
			role="tabpanel"
			tabindex="0"
			aria-labelledby="registered-tab"
			hidden={activeTab !== 'registered'}
		>
			{#if data.registered.length === 0}
				<p>まだ登録していません。「科目を探す」のタブから登録してください。</p>
			{:else}
				<ul class="subjects">
					{#each data.registered as subject (subject.id)}
						<li>
							<h3>
								<a href={resolve('/app/subjects/[year]/[code]', subject.path)}>{subject.name}</a>
							</h3>
							<p class="meta">
								{formatTerm(
									subject.term,
								)}{#if subject.teacher}、{subject.teacher}{/if}{#if subject.userAdded}、シラバスにない授業{/if}
							</p>
							{#if subject.noPeriod}
								<p class="note">
									{formatTerm(
										subject.term,
									)}の期間が学年暦にまだないため、この科目は時間割に出ません。管理者が期間を入れると出ます。
								</p>
							{/if}
							{#if subject.slots.length === 0}
								<p>曜日と時限が、まだ登録されていません。</p>
							{:else}
								<ul class="slots">
									{#each subject.slots as slot (`${slot.weekday}-${slot.period}`)}
										<li>
											{formatSlot(slot)}{#if slot.room}、{slot.room}{/if}
										</li>
									{/each}
								</ul>
							{/if}

							{#if subject.personalSlots.length > 0}
								<p class="note">自分だけに使っている曜日と時限:</p>
								<ul class="slots">
									{#each subject.personalSlots as slot (`${slot.weekday}-${slot.period}`)}
										<li>
											{formatSlot(slot)}{#if slot.room}、{slot.room}{/if}
											<form method="POST" action="?/removePersonalSlot" use:enhance class="inline">
												<input type="hidden" name="subjectId" value={subject.id} />
												<input type="hidden" name="weekday" value={slot.weekday} />
												<input type="hidden" name="period" value={slot.period} />
												<Button type="submit" variant="outlined"
													><Label
														>消す<span class="visually-hidden">: {formatSlot(slot)}</span></Label
													></Button
												>
											</form>
										</li>
									{/each}
								</ul>
							{/if}

							{#if data.slotSharingMode !== 'closed'}
								<details>
									<summary>曜日と時限を登録する</summary>
									<form method="POST" action="?/addSlot" use:enhance class="slot-form">
										<input type="hidden" name="subjectId" value={subject.id} />
										<SlotFields />
										<Button type="submit" variant="unelevated"><Label>登録する</Label></Button>
									</form>
									<p class="note">
										{#if data.slotSharingMode === 'moderated'}
											曜日、時限、教室は、大学から自動では取得できないため、利用者どうしで登録しています。モデレーターか管理者が確かめてから登録され、同じ科目を履修しているほかの利用者の時間割にも使われます。
										{:else}
											曜日、時限、教室は、大学から自動では取得できないため、利用者どうしで登録しています。登録した内容は、同じ科目を履修しているほかの利用者の時間割にも使われます。
										{/if}
									</p>
								</details>
							{/if}

							<details>
								<summary>自分だけに使う曜日と時限を登録する</summary>
								<form method="POST" action="?/addPersonalSlot" use:enhance class="slot-form">
									<input type="hidden" name="subjectId" value={subject.id} />
									<SlotFields />
									<Button type="submit" variant="unelevated"><Label>登録する</Label></Button>
								</form>
								<p class="note">
									ほかの利用者には見えず、自分の時間割にだけ使われます。共有の登録が確認待ちや、できない設定のときにも使えます。
								</p>
							</details>

							<form
								method="POST"
								action="?/unregister"
								use:confirmSubmit={'履修登録を取り消します。よろしいですか?'}
								use:enhance
							>
								<input type="hidden" name="subjectId" value={subject.id} />
								<Button type="submit" variant="outlined"><Label>登録を取り消す</Label></Button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div
			id="search-panel"
			role="tabpanel"
			tabindex="0"
			aria-labelledby="search-tab"
			hidden={activeTab !== 'search'}
		>
			<form method="GET" role="search" data-sveltekit-keepfocus data-sveltekit-noscroll>
				<input type="hidden" name="tab" value="search" />
				<TextField
					label="科目名、教員、シラバスの番号"
					type="search"
					name="q"
					value={data.query}
					maxlength={100}
				/>
				<Button type="submit" variant="unelevated"><Label>探す</Label></Button>
			</form>

			{#if data.query.trim() !== ''}
				{#if data.results.length === 0}
					<p>
						見つかりませんでした。シラバスにない授業なら、下の「シラバスにない授業を足す」から足せます。
					</p>
				{:else}
					<ul class="subjects">
						{#each data.results as subject (subject.id)}
							<li>
								<h3>
									<a href={resolve('/app/subjects/[year]/[code]', subject.path)}>{subject.name}</a>
								</h3>
								<p class="meta">
									{formatTerm(
										subject.term,
									)}{#if subject.teacher}、{subject.teacher}{/if}{#if subject.userAdded}、シラバスにない授業{/if}
								</p>
								<form method="POST" action="?/register" use:enhance>
									<input type="hidden" name="subjectId" value={subject.id} />
									<Button type="submit" variant="unelevated"><Label>登録する</Label></Button>
								</form>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</div>

		<section aria-labelledby="create-heading">
			<h2 id="create-heading">シラバスにない授業を足す</h2>
			<details>
				<summary>公開シラバスに載っていない授業を、科目として足す</summary>
				<p class="note" id="create-name-note">
					授業の名前は、クラスも含めて書きます (例:
					キャリアガイダンス)。足した授業は、ほかの利用者も探して登録できます。同じ名前の科目があれば、足さずにそちらを案内します。足した授業は、あなたと管理者が直したり消したりできます。
				</p>
				<form method="POST" action="?/createSubject" use:enhance class="slot-form">
					<TextField
						label="授業の名前"
						aria-describedby="create-name-note"
						name="name"
						maxlength={100}
						required
						autocomplete="off"
						value={data.query}
					/>
					<SelectField label="学期" name="term" required value={data.defaultTerm}>
						{#each TERMS as term (term)}
							<option value={term}>{formatTerm(term)}</option>
						{/each}
					</SelectField>
					<TextField label="教員 (任意)" name="teacher" maxlength={100} autocomplete="off" />
					<Button type="submit" variant="unelevated"><Label>足して登録する</Label></Button>
				</form>
			</details>
		</section>

		<p>
			学生ポータルの時間割から、まとめて登録することもできます:
			<a href={resolve('app/courses/import')}>ポータルの時間割から取り込む</a>
		</p>
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
	.slot-form {
		@include mixins.wrap-row(0.5rem 1rem);
		align-items: end;
	}
	.inline {
		display: inline;
		margin-left: 0.5rem;
	}
	.note {
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		background: var(--fm-surface-muted);
	}
</style>
