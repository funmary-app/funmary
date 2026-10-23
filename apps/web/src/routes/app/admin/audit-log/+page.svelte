<script lang="ts">
	import DataTable, { Body, Cell, Head, Row } from '@smui/data-table';
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
		<DataTable>
			<Head>
				<Row>
					<Cell>日時</Cell>
					<Cell>行った人</Cell>
					<Cell>操作</Cell>
					<Cell>内容</Cell>
				</Row>
			</Head>
			<Body>
				{#each data.entries as entry (entry.id)}
					<Row>
						<Cell class="numeric">{entry.at}</Cell>
						<Cell>{entry.actorEmail ?? '(退会済み)'}</Cell>
						<Cell>{entry.action}</Cell>
						<Cell>
							{#if entry.subjectPath}
								<a href={resolve('/app/subjects/[year]/[code]', entry.subjectPath)}
									>{entry.summary}</a
								>
							{:else}
								{entry.summary}
							{/if}
						</Cell>
					</Row>
				{/each}
			</Body>
		</DataTable>
	{/if}
</div>
