import { describe, expect, it } from 'vitest';
import { CHANNEL_KIND_OPTIONS, parseChannelKinds } from './channel-kind-form.ts';

function form(kinds: string | string[]) {
	const data = new FormData();
	for (const kind of Array.isArray(kinds) ? kinds : [kinds]) data.append('kinds', kind);
	return data;
}

describe('届ける通知の種類のフォーム', () => {
	it('選ばれた種類を、決まった順にそろえて返す', () => {
		expect(parseChannelKinds(form(['roomChange', 'cancellation']))).toEqual([
			'cancellation',
			'roomChange',
		]);
	});

	it('知らない種類は無視する。1 つも選ばれていなければ null', () => {
		expect(parseChannelKinds(form(['makeup', 'notice']))).toEqual(['makeup']);
		expect(parseChannelKinds(new FormData())).toBeNull();
	});

	it('選択肢は 5 つ', () => {
		expect(CHANNEL_KIND_OPTIONS).toHaveLength(5);
	});
});
