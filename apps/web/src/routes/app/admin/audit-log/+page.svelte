<script lang="ts">
	import { resolve } from '$app/paths';
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';
	import type { SubjectPathParams } from '#lib/subject-path.ts';

	interface EntryRow {
		id: number;
		actorEmail: string | null;
		action: string;
		summary: string;
		subjectPath: SubjectPathParams | null;
		at: string;
	}

	let { data }: { data: { entries: EntryRow[] } } = $props();
</script>

<svelte:head>
	<title>操作の記録 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page page-w-56">
	<SettingsBreadcrumb current="操作の記録" />
	<h1>操作の記録</h1>
	<p class="muted">
		シラバスにない授業の公開、情報の変更、削除、授業名の紐づけなど、利用者が全体に影響する操作をした記録です。時刻は日本時間です。この記録は消せません。
	</p>

	{#if data.entries.length === 0}
		<p>まだ記録がありません。</p>
	{:else}
		<div class="scroll">
			<table>
				<thead>
					<tr>
						<th scope="col">日時</th>
						<th scope="col">行った人</th>
						<th scope="col">操作</th>
						<th scope="col">内容</th>
					</tr>
				</thead>
				<tbody>
					{#each data.entries as entry (entry.id)}
						<tr>
							<td class="numeric">{entry.at}</td>
							<td>{entry.actorEmail ?? '(退会済み)'}</td>
							<td>{entry.action}</td>
							<td>
								{#if entry.subjectPath}
									<a href={resolve('/app/subjects/[year]/[code]', entry.subjectPath)}
										>{entry.summary}</a
									>
								{:else}
									{entry.summary}
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style lang="scss">
	.scroll {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	th,
	td {
		padding: 0.5rem;
		border-bottom: 1px dashed var(--fm-divider);
		text-align: left;
		vertical-align: top;
	}

	thead th {
		color: var(--fm-text-muted);
		font-weight: 400;
		white-space: nowrap;
	}

	td.numeric {
		white-space: nowrap;
	}
</style>
