<script lang="ts">
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import { confirmSubmit } from '#lib/actions/confirm-submit.ts';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';

	let { data, form }: { data: { email: string }; form: { error?: string } | null } = $props();
</script>

<svelte:head>
	<title>アカウント - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<SettingsBreadcrumb current="アカウント" />
	<h1>アカウント</h1>
	<p class="muted">{data.email}</p>

	<section aria-labelledby="export-heading">
		<h2 id="export-heading">データの書き出し</h2>
		<p>
			履修科目、予定、通知、トークンの名前や期限など、Funmary が持っているあなたのデータを、JSON
			のファイルで受け取れます。トークンそのものや、Webhook の URL などの秘密は入っていません。
		</p>
		<!-- ファイルのダウンロードなので、ページの遷移ではなく通常の移動にする -->
		<Button href="/app/settings/account/export" variant="outlined" data-sveltekit-reload>
			<Label>JSON をダウンロード</Label>
		</Button>
	</section>

	<section aria-labelledby="delete-heading">
		<h2 id="delete-heading">退会</h2>
		<p>
			アカウントと、履修科目、予定、通知、トークン、Discord
			連携などのデータを、すべて消します。元に戻せません。
		</p>
		<ul>
			<li>
				自分だけが見られる、足した科目も消えます。公開した科目と予定は、持ち主の情報を外して残ります
			</li>
			<li>Discord に作った非公開スレッドは、Discord 側に残ります。自分で消してください</li>
			<li>消したあとも、同じ大学のアカウントで、あらためて登録できます</li>
		</ul>
		<FormNotice error={form?.error ?? null} />
		<form
			method="POST"
			action="?/delete"
			use:confirmSubmit={'アカウントとデータをすべて消します。元に戻せません。よろしいですか?'}
			use:enhance
		>
			<label for="email">確かめのため、メールアドレス ({data.email}) を入力してください</label>
			<input id="email" name="email" type="email" required autocomplete="off" spellcheck="false" />
			<div class="actions">
				<Button type="submit" variant="outlined"><Label>退会する</Label></Button>
			</div>
		</form>
	</section>
</div>

<style lang="scss">
	@use 'mixins';

	h2 {
		margin: 2.5rem 0 1rem;
	}

	form {
		@include mixins.stack(0.5rem);
		max-width: 28rem;
	}

	.actions {
		margin-top: 0.5rem;
	}
</style>
