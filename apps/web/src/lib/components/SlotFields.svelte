<script lang="ts">
	// 曜日と時限を登録するフォームの欄 (曜日、時限、教室)。共有の登録と、自分だけの登録で同じ欄を使う
	import { DEFAULT_PERIODS } from '@funmary/core';
	import { WEEKDAY_LABELS } from '#lib/term-label.ts';
</script>

<label>
	曜日
	<select name="weekday" required>
		{#each WEEKDAY_LABELS as day (day.weekday)}
			<option value={day.weekday}>{day.label}曜</option>
		{/each}
	</select>
</label>
<label>
	時限
	<select name="period" required>
		{#each DEFAULT_PERIODS as period (period.number)}
			<option value={period.number}>{period.number} 限</option>
		{/each}
	</select>
</label>
<label>
	教室 (分からなければ空のまま)
	<input name="room" maxlength="100" autocomplete="off" />
</label>

<style lang="scss">
	@use 'mixins';

	label {
		@include mixins.stack(0.25rem);
		font-size: 0.875rem;
	}
</style>
