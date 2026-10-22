<script lang="ts">
	// 破壊的な操作の前の確認 (use:confirmSubmit が出す)。最上位のレイアウトに 1 つだけ置く
	import Button, { Label } from '@smui/button';
	import Dialog, { Actions, Content } from '@smui/dialog';
	import { answerConfirm, confirmDialog } from '#lib/confirm-dialog.svelte.ts';

	let open = $derived(confirmDialog.message !== null);
	// SMUI は外側の枠と中の面の両方を alertdialog にするので、読み上げで 2 つにならないよう、
	// 外側 (role、aria-modal) は役割なしにし、説明は中の面 (surface$) に付ける
</script>

<Dialog
	bind:open
	role="presentation"
	aria-modal={undefined}
	surface$aria-describedby="confirm-dialog-content"
	onSMUIDialogClosed={(event: CustomEvent<{ action?: string }>) =>
		answerConfirm(event.detail.action === 'accept')}
>
	<Content id="confirm-dialog-content">{confirmDialog.message ?? ''}</Content>
	<Actions>
		<Button action="cancel"><Label>やめる</Label></Button>
		<Button action="accept" defaultAction><Label>続ける</Label></Button>
	</Actions>
</Dialog>
