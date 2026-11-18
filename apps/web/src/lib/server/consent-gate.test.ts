import { describe, expect, it } from 'vitest';
import { consentPath, needsConsent, safeNextPath } from './consent-gate.ts';

describe('needsConsent', () => {
	it('アプリの画面と、API の同意画面は止める', () => {
		for (const path of ['/app', '/app/week', '/app/settings/tokens', '/oauth/authorize']) {
			expect(needsConsent(path), path).toBe(true);
		}
	});

	it('同意するために要る画面と、Cookie を使わない口は止めない', () => {
		for (const path of [
			'/',
			'/consent',
			'/terms',
			'/privacy',
			'/about',
			'/login',
			'/auth/google',
			'/auth/logout',
			'/brand/logo-light.svg',
			'/favicon.ico',
			'/_app/immutable/x.js',
			'/healthz',
			'/api/v1/lessons',
			'/mcp',
			'/oauth/token',
			'/oauth/register',
			'/cal/abc.ics',
			'/feed/abc/rss.xml',
		]) {
			expect(needsConsent(path), path).toBe(false);
		}
	});

	it('名前が似ているだけのパスは止めない', () => {
		expect(needsConsent('/apple')).toBe(false);
		expect(needsConsent('/oauth/authorized')).toBe(false);
	});
});

describe('consentPath', () => {
	it('戻る先を、クエリごと next に入れる', () => {
		expect(consentPath({ pathname: '/app/week', search: '?date=2026-10-05' })).toBe(
			'/consent?next=%2Fapp%2Fweek%3Fdate%3D2026-10-05',
		);
	});
});

describe('safeNextPath', () => {
	it('このサイトの中のパスなら、そのまま返す', () => {
		expect(safeNextPath('/app/week?date=2026-10-05')).toBe('/app/week?date=2026-10-05');
		expect(safeNextPath('/oauth/authorize?client_id=abc&state=x')).toBe(
			'/oauth/authorize?client_id=abc&state=x',
		);
	});

	it('別のサイトや、不正な値は /app にする', () => {
		for (const value of [
			null,
			'',
			'https://evil.example/',
			'//evil.example/x',
			'/\\evil.example',
			'app/week',
			'/app\n/x',
			'javascript:alert(1)',
		]) {
			expect(safeNextPath(value), String(value)).toBe('/app');
		}
	});

	it('同意画面自身には戻さない (ぐるぐる回らないように)', () => {
		expect(safeNextPath('/consent')).toBe('/app');
		expect(safeNextPath('/consent?next=%2Fapp')).toBe('/app');
	});
});
