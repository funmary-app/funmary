// 実際の DOM は使わず、addEventListener/removeEventListener と requestSubmit だけを持つ偽の要素で試す
// (このパッケージのテストは Node 環境で動かし、jsdom は入れていないため)。
// 確認のダイアログの代わりに、ダイアログが読む状態 (confirmDialog) と、ボタンを押したときの answerConfirm を使う
import { describe, expect, it, vi } from 'vitest';
import { answerConfirm, confirmDialog } from '#lib/confirm-dialog.svelte.ts';
import { confirmSubmit } from './confirm-submit.ts';

type FakeEvent = {
	submitter: unknown;
	preventDefault: () => void;
	stopImmediatePropagation: () => void;
};
type Listener = (event: FakeEvent) => void;
type Options = { capture?: boolean } | undefined;

// イベントの対象の要素での、ブラウザの動きをまねる。捕捉 (capture) のリスナーを登録の順に関係なく先に呼び、
// stopImmediatePropagation のあとのリスナーは呼ばない。外すときは、登録と同じ capture を指定しないと外れない。
// requestSubmit は、渡したボタンを submitter にして、もう一度 submit を起こす
function createFakeForm() {
	const listeners: { listener: Listener; capture: boolean }[] = [];
	const events: FakeEvent[] = [];
	const fireSubmit = (submitter: unknown = null) => {
		let stopped = false;
		const event: FakeEvent = {
			submitter,
			preventDefault: vi.fn(),
			stopImmediatePropagation: vi.fn(() => {
				stopped = true;
			}),
		};
		events.push(event);
		const ordered = [
			...listeners.filter((entry) => entry.capture),
			...listeners.filter((entry) => !entry.capture),
		];
		for (const { listener } of ordered) {
			if (stopped) break;
			listener(event);
		}
		return event;
	};
	return {
		isConnected: true,
		events,
		fireSubmit,
		requestSubmit: vi.fn((submitter?: unknown) => fireSubmit(submitter ?? null)),
		addEventListener: (_type: string, listener: Listener, options?: Options) =>
			listeners.push({ listener, capture: options?.capture ?? false }),
		removeEventListener: (_type: string, listener: Listener, options?: Options) => {
			const capture = options?.capture ?? false;
			const index = listeners.findIndex(
				(entry) => entry.listener === listener && entry.capture === capture,
			);
			if (index >= 0) listeners.splice(index, 1);
		},
	};
}

/** ダイアログで押したボタンが、送り直し (requestSubmit) まで届くのを待つ */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('confirmSubmit', () => {
	it('送信を止めて、確認のダイアログに文言を出す。先に登録された use:enhance のリスナーも呼ばない', () => {
		const form = createFakeForm();
		const enhanceListener = vi.fn();
		form.addEventListener('submit', enhanceListener);
		confirmSubmit(form as unknown as HTMLFormElement, '消しますか?');

		const event = form.fireSubmit();

		expect(event.preventDefault).toHaveBeenCalled();
		expect(event.stopImmediatePropagation).toHaveBeenCalled();
		expect(enhanceListener).not.toHaveBeenCalled();
		expect(confirmDialog.message).toBe('消しますか?');
		answerConfirm(false);
	});

	it('「続ける」を押すと、押したボタンのままもう一度送り、そのときは止めない', async () => {
		const form = createFakeForm();
		const enhanceListener = vi.fn();
		form.addEventListener('submit', enhanceListener);
		confirmSubmit(form as unknown as HTMLFormElement, '消しますか?');
		const button = { name: 'action', value: 'remove' };

		form.fireSubmit(button);
		answerConfirm(true);
		await settle();

		expect(form.requestSubmit).toHaveBeenCalledWith(button);
		const resent = form.events[1];
		expect(resent?.preventDefault).not.toHaveBeenCalled();
		expect(enhanceListener).toHaveBeenCalledTimes(1);
		expect(confirmDialog.message).toBeNull();
	});

	it('「やめる」を押すと、送らない', async () => {
		const form = createFakeForm();
		confirmSubmit(form as unknown as HTMLFormElement, '消しますか?');

		form.fireSubmit();
		answerConfirm(false);
		await settle();

		expect(form.requestSubmit).not.toHaveBeenCalled();
	});

	it('update で、確認の文言を変えられる', () => {
		const form = createFakeForm();
		const action = confirmSubmit(form as unknown as HTMLFormElement, '最初の文言');

		action?.update?.('直した文言');
		form.fireSubmit();

		expect(confirmDialog.message).toBe('直した文言');
		answerConfirm(false);
	});

	it('destroy で、リスナーを外す', () => {
		const form = createFakeForm();
		const action = confirmSubmit(form as unknown as HTMLFormElement, '消しますか?');

		action?.destroy?.();
		const event = form.fireSubmit();

		expect(event.preventDefault).not.toHaveBeenCalled();
		expect(confirmDialog.message).toBeNull();
	});
});
