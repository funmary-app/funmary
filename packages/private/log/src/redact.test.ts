import { describe, expect, it } from 'vitest';
import { redact } from './redact.ts';

describe('redact', () => {
	it('カレンダー購読 URL のトークンを伏せる', () => {
		expect(redact('GET /cal/abcDEF123_-xyz.ics 200')).toBe('GET /cal/***.ics 200');
		expect(redact('https://funmary.example.com/cal/secret-token.ics?x=1')).toBe(
			'https://funmary.example.com/cal/***.ics?x=1',
		);
	});

	it('フィードと共有リンクの URL のトークンを伏せ、後ろのパスは残す', () => {
		expect(redact('/feed/tok123/rss.xml')).toBe('/feed/***/rss.xml');
		expect(redact('/share/tok123')).toBe('/share/***');
	});

	it('Discord の Webhook の URL を伏せる', () => {
		expect(
			redact('送信先 https://discord.com/api/webhooks/123456789012345678/AbC-dEf_123 に失敗'),
		).toBe('送信先 https://discord.com/api/webhooks/*** に失敗');
	});

	it('監視サービスの ping の URL を伏せる', () => {
		expect(redact('https://hc-ping.com/0a1b2c3d-1111-2222-3333-444455556666')).toBe(
			'https://hc-ping.com/***',
		);
	});

	it('個人用のアクセストークンを伏せる', () => {
		expect(redact('Authorization: Bearer fmy_AbC123_x-y')).toBe('Authorization: Bearer fmy_***');
	});

	it('URL の query の token、authtoken、secret、key を伏せる', () => {
		expect(redact('https://hope.example.com/export.php?userid=1&authtoken=abc123&preset=all')).toBe(
			'https://hope.example.com/export.php?userid=1&authtoken=***&preset=all',
		);
	});

	it('メールアドレスを伏せる', () => {
		expect(redact('login: taro.yamada+x@fun.ac.jp が拒否された')).toBe(
			'login: ***@*** が拒否された',
		);
	});

	it('伏せるものがなければそのまま返す', () => {
		const text = '[portal] 取得に成功 (12 件、前回から変化なし、820 ms)';
		expect(redact(text)).toBe(text);
	});

	it('1 つの文に複数あれば、すべて伏せる', () => {
		expect(redact('/cal/a.ics と /cal/b.ics と a@example.com')).toBe(
			'/cal/***.ics と /cal/***.ics と ***@***',
		);
	});
});
