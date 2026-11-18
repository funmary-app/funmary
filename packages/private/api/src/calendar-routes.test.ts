import { describe, expect, it, vi } from 'vitest';
import { createApi } from './app.ts';
import type { CalendarRoutesDeps } from './calendar-routes.ts';

const TOKEN = 'a'.repeat(43);

function setup(overrides: Partial<CalendarRoutesDeps> = {}) {
	const loadFeed = vi.fn<CalendarRoutesDeps['loadFeed']>((token) =>
		token === TOKEN
			? {
					feed: {
						lessons: [],
						days: [{ date: '2026-10-14', summary: '振替授業日 (月曜の授業)' }],
					},
					stamp: new Date('2026-10-01T00:00:00Z'),
				}
			: null,
	);
	const api = createApi({
		checkHealth: () => true,
		calendar: { loadFeed, uidDomain: 'funmary.example.com', ...overrides },
	});
	return { api, loadFeed };
}

describe('GET /cal/<トークン>.ics', () => {
	it('トークンの持ち主の予定を ICS で返し、15 分のキャッシュと noindex を付ける', async () => {
		const { api, loadFeed } = setup();
		const res = await api.request(`/cal/${TOKEN}.ics`);
		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
		expect(res.headers.get('Cache-Control')).toBe('private, max-age=900');
		expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
		expect(res.headers.get('ETag')).toBeTruthy();
		const body = await res.text();
		expect(body).toMatch(/^BEGIN:VCALENDAR\r\n/);
		expect(body).toContain('SUMMARY:振替授業日 (月曜の授業)');
		expect(loadFeed).toHaveBeenCalledWith(TOKEN);
	});

	it('内容が変わっていなければ、304 を返す', async () => {
		const { api } = setup();
		const first = await api.request(`/cal/${TOKEN}.ics`);
		const etag = first.headers.get('ETag') ?? '';
		const second = await api.request(`/cal/${TOKEN}.ics`, {
			headers: { 'If-None-Match': etag },
		});
		expect(second.status).toBe(304);
		expect(await second.text()).toBe('');
	});

	it('知らないトークンや、形の違うパスには 404 を返す', async () => {
		const { api, loadFeed } = setup();
		expect((await api.request(`/cal/${'b'.repeat(43)}.ics`)).status).toBe(404);
		expect((await api.request(`/cal/${TOKEN}`)).status).toBe(404);
		expect((await api.request('/cal/..%2Fsecret.ics')).status).toBe(404);
		// 形の違うトークンでは、DB を引かない
		expect(loadFeed).toHaveBeenCalledTimes(1);
	});

	it('同じトークンで短い間に取りに来すぎたら、429 を返す', async () => {
		const { api } = setup();
		const statuses: number[] = [];
		for (let i = 0; i < 61; i++) {
			statuses.push((await api.request(`/cal/${TOKEN}.ics`)).status);
		}
		expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true);
		expect(statuses[60]).toBe(429);
	});
});

describe('利用規約への同意を待っている持ち主の購読', () => {
	it('403 で、同意画面の URL を添えた説明を返し、キャッシュさせない', async () => {
		const api = createApi({
			checkHealth: () => true,
			calendar: {
				loadFeed: () => 'terms-required',
				uidDomain: 'funmary.example.com',
				consentUrl: 'https://funmary.example.com/consent',
			},
		});

		const res = await api.request(`/cal/${'a'.repeat(43)}.ics`);

		expect(res.status).toBe(403);
		expect(res.headers.get('Cache-Control')).toBe('no-store');
		expect(await res.text()).toContain('https://funmary.example.com/consent');
	});
});
