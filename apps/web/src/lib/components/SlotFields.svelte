<script lang="ts">
	// 曜日と時限を登録するフォームの欄 (曜日、時限、教室)。共有の登録と、自分だけの登録で同じ欄を使う
	import SelectField from '#lib/components/SelectField.svelte';
	import { DEFAULT_PERIODS } from '@funmary/core';
	import { WEEKDAY_LABELS } from '#lib/term-label.ts';
	import TextField from '#lib/components/TextField.svelte';
</script>

<SelectField label="曜日" name="weekday" required>
	{#each WEEKDAY_LABELS as day (day.weekday)}
		<option value={day.weekday}>{day.label}曜</option>
	{/each}
</SelectField>
<SelectField label="時限" name="period" required>
	{#each DEFAULT_PERIODS as period (period.number)}
		<option value={period.number}>{period.number} 限</option>
	{/each}
</SelectField>
<TextField label="教室 (分からなければ空のまま)" name="room" maxlength={100} autocomplete="off" />
