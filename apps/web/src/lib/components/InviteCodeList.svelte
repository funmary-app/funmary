<script lang="ts">
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import { confirmSubmit } from '#lib/actions/confirm-submit.ts';
	import type { InviteCodeView } from '#lib/server/invites.ts';

	// まだ使える招待コードの一覧。発行の画面 (自分のコード) と管理画面 (全員のコード) で使う。
	// 使い切り、期限切れ、取り消し済みのコードは、渡す前に除いてある
	let { codes, showIssuer = false }: { codes: readonly InviteCodeView[]; showIssuer?: boolean } =
		$props();
</script>

{#if codes.length === 0}
	<p class="muted">使える招待コードはありません。</p>
{:else}
	<ul class="codes">
		{#each codes as code (code.id)}
			<li>
				<span class="note">{code.note ?? '(メモなし)'}</span>
				<p class="detail">
					使用 {code.usedCount} / {code.maxUses} 回、期限 {code.expiresAt ?? 'なし'}、発行
					{code.createdAt}
					{#if showIssuer}、発行者 {code.createdByEmail ?? '(管理用コマンド)'}{/if}
				</p>
				<form
					method="POST"
					action="?/revoke"
					use:confirmSubmit={'この招待コードを取り消します。よろしいですか?'}
					use:enhance
				>
					<input type="hidden" name="id" value={code.id} />
					<Button type="submit" variant="outlined">
						<Label>取り消す<span class="visually-hidden">: {code.note ?? '(メモなし)'}</span></Label
						>
					</Button>
				</form>
			</li>
		{/each}
	</ul>
{/if}

<style lang="scss">
	.codes {
		margin: 0;
		padding: 0;
		list-style: none;

		li {
			display: grid;
			gap: 0.25rem;
			padding: 0.75rem 0;
			border-bottom: 1px dashed var(--fm-divider);
		}
	}

	.note {
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.detail {
		margin: 0;
		color: var(--fm-text-muted);
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
	}
</style>
