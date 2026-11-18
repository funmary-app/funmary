import { describe, expect, it } from 'vitest';
import { qrCode, subscriptionLinks } from './calendar-subscription.ts';

describe('subscriptionLinks', () => {
	it('購読 URL と、webcal の URL と、Google カレンダーに追加する URL を作る', () => {
		const links = subscriptionLinks('https://funmary.example.com', 'abc_-');
		expect(links.url).toBe('https://funmary.example.com/cal/abc_-.ics');
		expect(links.webcal).toBe('webcal://funmary.example.com/cal/abc_-.ics');
		expect(links.google).toBe(
			'https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Ffunmary.example.com%2Fcal%2Fabc_-.ics',
		);
	});

	it('開発サーバー (http) でも webcal の URL にする', () => {
		expect(subscriptionLinks('http://localhost:5173', 't').webcal).toBe(
			'webcal://localhost:5173/cal/t.ics',
		);
	});
});

describe('qrCode', () => {
	it('暗いマスを SVG の path にする。大きさはマス目の数と余白の和', () => {
		const qr = qrCode('https://funmary.example.com/cal/abc.ics');
		expect(qr.size).toBeGreaterThanOrEqual(21 + 8);
		expect(qr.path).toMatch(/^(M\d+ \d+h1v1h-1z)+$/);
	});
});
