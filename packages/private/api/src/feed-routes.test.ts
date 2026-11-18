import { describe, expect, it, vi } from 'vitest';
import { createApi } from './app.ts';
import type { FeedRoutesDeps } from './feed-routes.ts';

const TOKEN = 'a'.repeat(43);

function setup(overrides: Partial<FeedRoutesDeps> = {}) {
	const loadFeed = vi.fn<FeedRoutesDeps['loadFeed']>((token) =>
		token === TOKEN
			? {
					options: {
						title: 'Funmary の通知',
						link: 'https://funmary.example.com/app/notifications',
						author: { name: 'Funmary' },
					},
					items: [
						{
							title: '[休講] 情報処理演習 (10/3 2 限)',
							id: 'https://funmary.example.com/app/notifications#ntf-1',
							link: 'https://funmary.example.com/app/subjects/2026/100201',
							description: '[休講] 情報処理演習 (10/3 2 限)',
							published: new Date('2026-10-01T00:00:00Z'),
						},
					],
				}
			: null,
	);
	const api = createApi({ checkHealth: () => true, feed: { loadFeed, ...overrides } });
	return { api, loadFeed };
}

describe('GET /feed/<トークン>/{rss.xml,atom.xml,feed.json}', () => {
	it('RSS で通知欄の項目を返し、15 分のキャッシュと noindex を付ける', async () => {
		const { api, loadFeed } = setup();
		const res = await api.request(`/feed/${TOKEN}/rss.xml`);
		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Type')).toContain('xml');
		expect(res.headers.get('Cache-Control')).toBe('private, max-age=900');
		expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
		expect(res.headers.get('ETag')).toBeTruthy();
		const body = await res.text();
		expect(body).toContain('<rss');
		expect(body).toContain('[休講] 情報処理演習 (10/3 2 限)');
		expect(loadFeed).toHaveBeenCalledWith(TOKEN);
	});

	it('Atom と JSON Feed でも同じ項目を返す', async () => {
		const { api } = setup();
		const atom = await api.request(`/feed/${TOKEN}/atom.xml`);
		expect(atom.status).toBe(200);
		expect(await atom.text()).toContain('<feed');

		const json = await api.request(`/feed/${TOKEN}/feed.json`);
		expect(json.status).toBe(200);
		expect(json.headers.get('Content-Type')).toContain('json');
		const body = (await json.json()) as { items: { title: string }[] };
		expect(body.items[0]?.title).toBe('[休講] 情報処理演習 (10/3 2 限)');
	});

	it('内容が変わっていなければ、304 を返す', async () => {
		const { api } = setup();
		const first = await api.request(`/feed/${TOKEN}/rss.xml`);
		const etag = first.headers.get('ETag') ?? '';
		const second = await api.request(`/feed/${TOKEN}/rss.xml`, {
			headers: { 'If-None-Match': etag },
		});
		expect(second.status).toBe(304);
	});

	it('知らないトークンや、形の違うトークンには 404 を返す', async () => {
		const { api, loadFeed } = setup();
		expect((await api.request(`/feed/${'b'.repeat(43)}/rss.xml`)).status).toBe(404);
		expect((await api.request(`/feed/${TOKEN.slice(0, -1)}/rss.xml`)).status).toBe(404);
		// 形の違うトークンでは、DB を引かない
		expect(loadFeed).toHaveBeenCalledTimes(1);
	});

	it('同じトークンで短い間に取りに来すぎたら、429 を返す', async () => {
		const { api } = setup();
		const statuses: number[] = [];
		for (let i = 0; i < 61; i++) {
			statuses.push((await api.request(`/feed/${TOKEN}/rss.xml`)).status);
		}
		expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true);
		expect(statuses[60]).toBe(429);
	});
});

describe('利用規約への同意を待っている持ち主の購読', () => {
	it('403 で、同意画面の URL を添えた説明を返し、キャッシュさせない', async () => {
		const { api } = setup({
			loadFeed: () => 'terms-required',
			consentUrl: 'https://funmary.example.com/consent',
		});

		const res = await api.request(`/feed/${TOKEN}/rss.xml`);

		expect(res.status).toBe(403);
		expect(res.headers.get('Cache-Control')).toBe('no-store');
		expect(await res.text()).toContain('https://funmary.example.com/consent');
	});
});
