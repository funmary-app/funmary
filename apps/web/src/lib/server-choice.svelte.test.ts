import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { serverChoice } from './server-choice.svelte.ts';

/** サーバーの値 (data の読み直しで変わる) と、それに付いて回る選び直した値 */
function setup(initial: string) {
	let server = $state(initial);
	return {
		choice: serverChoice(() => server),
		reload: (next: string) => {
			server = next;
			flushSync();
		},
	};
}

describe('serverChoice', () => {
	it('選び直すまでは、サーバーの値を返す', () => {
		const { choice } = setup('evening');
		expect(choice.value).toBe('evening');
	});

	it('選び直した値は、サーバーから同じ値が読み直されても残る (ほかのフォームを送って data が読み直されたとき)', () => {
		const { choice, reload } = setup('evening');
		choice.value = 'custom';
		reload('evening');
		expect(choice.value).toBe('custom');
	});

	it('サーバーの値そのものが変わったら、サーバーの値に合わせる (保存したときや、ほかの端末で変えたとき)', () => {
		const { choice, reload } = setup('evening');
		choice.value = 'custom';
		reload('morning');
		expect(choice.value).toBe('morning');
	});
});
