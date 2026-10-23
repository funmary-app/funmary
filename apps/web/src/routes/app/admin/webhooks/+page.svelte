<script lang="ts">
	import TextField from '#lib/components/TextField.svelte';
	import Button, { Label } from '@smui/button';
	import { enhance } from '$app/forms';
	import FormNotice from '#lib/components/FormNotice.svelte';
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';

	let {
		data,
		form,
	}: {
		data: { limit: number; max: number };
		form: { error?: string; message?: string } | null;
	} = $props();
</script>

<svelte:head>
	<title>Webhook の上限 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page page-w-40">
	<SettingsBreadcrumb current="Webhook の上限" />
	<h1>Webhook の上限</h1>
	<p>
		利用者が通知の送り先に登録できる Webhook の個数です。0 にすると、新しく登録できなくなります。
	</p>
	<p>
		上限を下げても、登録済みの Webhook
		は消えません。上限を超えている間は、編集、無効化、削除だけができます。
	</p>

	<FormNotice error={form?.error} message={form?.message} />

	<form
		method="POST"
		action="?/save"
		use:enhance={() =>
			({ update }) =>
				update({ reset: false })}
	>
		<TextField
			class="limit"
			label="1 人あたりの上限 (0 から {data.max})"
			type="number"
			name="limit"
			min={0}
			max={data.max}
			step={1}
			value={data.limit}
			required
		/>
		<Button type="submit" variant="unelevated"><Label>保存する</Label></Button>
	</form>
</div>

<style lang="scss">
	@use 'forms';

	form {
		@include forms.column;

		:global(.limit) {
			width: 16rem;
		}
	}
</style>
