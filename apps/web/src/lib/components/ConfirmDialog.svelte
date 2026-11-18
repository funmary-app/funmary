<script lang="ts">
	import Button, { Label } from '@smui/button';
	import Dialog, { Actions, Content } from '@smui/dialog';
	import { answerConfirm, confirmDialog } from '#lib/confirm-dialog.svelte.ts';

	let open = $derived(confirmDialog.message !== null);
	// SMUI は外枠と内側の両方に alertdialog を付ける。読み上げが重複しないよう外枠の役割を外し、説明は内側 (surface$) に付ける。
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
