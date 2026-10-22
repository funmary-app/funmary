<script lang="ts">
	import Button, { Label } from '@smui/button';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import { CURRENT_TERMS_VERSION } from '#lib/legal-versions.ts';

	let {
		data,
		form,
	}: {
		data: { email: string; reconsent: boolean; termsUpdatedAt: string; privacyUpdatedAt: string };
		form: { error?: string } | null;
	} = $props();
</script>

<svelte:head>
	<title>利用規約への同意 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page page-w-36">
	<h1>{data.reconsent ? '利用規約が更新されました' : '利用規約への同意'}</h1>

	<FormNotice error={form?.error ?? null} />

	<p>
		{#if data.reconsent}
			利用規約かプライバシーポリシーの内容が変わりました。
		{:else}
			Funmary を使うには、利用規約とプライバシーポリシーへの同意が必要です。
		{/if}
		内容を読んで、同意してください。同意するまでは、アプリ、公開 API、MCP、Discord のコマンドと通知、カレンダーと
		RSS の購読を含む、すべての機能を止めています。
	</p>

	<ul class="documents">
		<li>
			<a href="/terms" target="_blank" rel="noopener noreferrer">利用規約</a>
			(最終更新日: {data.termsUpdatedAt})
		</li>
		<li>
			<a href="/privacy" target="_blank" rel="noopener noreferrer">プライバシーポリシー</a>
			(最終更新日: {data.privacyUpdatedAt})
		</li>
	</ul>

	<form method="POST">
		<input type="hidden" name="version" value={CURRENT_TERMS_VERSION} />
		<label class="agree">
			<input type="checkbox" name="agree" required />
			利用規約とプライバシーポリシーに同意します
		</label>
		<p class="account">ログイン中のアカウント: {data.email}</p>
		<div class="actions">
			<Button type="submit" variant="unelevated"><Label>同意して続ける</Label></Button>
		</div>
	</form>

	<form method="POST" action="/auth/logout" class="decline" data-sveltekit-reload>
		<p>同意しない場合は、ログアウトしてください。同意するまで、機能は使えません。</p>
		<Button type="submit" variant="outlined"><Label>同意せずにログアウト</Label></Button>
	</form>
</div>

<style lang="scss">
	@use 'forms';

	.documents {
		margin: 1rem 0 1.5rem;
		padding-left: 1.25rem;
		line-height: 1.8;
	}

	.agree {
		@include forms.choice-row;
	}

	.account {
		color: var(--fm-text-muted);
		overflow-wrap: anywhere;
	}

	.actions {
		margin-top: 1rem;
	}

	.decline {
		margin-top: 2.5rem;
		padding-top: 1.5rem;
		border-top: 1px dashed var(--fm-divider);
	}
</style>
