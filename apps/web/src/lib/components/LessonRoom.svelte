<script lang="ts">
	// 授業の教室。補講の教室が分からないときは、ふだんの教室を仮に出し、仮であることを文字で示す
	let { room, tentative }: { room: string | null; tentative: boolean } = $props();
</script>

{#if room}
	{tentative ? `${room} ` : room}{#if tentative}<span class="tentative">(仮。ふだんの教室)</span
		>{/if}
{:else}
	<span class="tentative">教室未定</span>
{/if}

<style lang="scss">
	.tentative {
		color: var(--fm-text-muted);
		font-size: 0.875em;
	}
</style>
