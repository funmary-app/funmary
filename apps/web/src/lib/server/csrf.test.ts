import { describe, expect, it } from 'vitest';
import { isCsrfForbidden } from './csrf.ts';

const SELF = 'https://funmary.example.com';
const base = {
	method: 'POST',
	path: '/app/settings',
	contentType: 'application/x-www-form-urlencoded',
	origin: SELF,
	selfOrigin: SELF,
};

describe('isCsrfForbidden', () => {
	it('同じ Origin の form は通す', () => {
		expect(isCsrfForbidden(base)).toBe(false);
	});

	it('別のサイトからの form と、Origin のない form は断る', () => {
		expect(isCsrfForbidden({ ...base, origin: 'https://evil.example' })).toBe(true);
		expect(isCsrfForbidden({ ...base, origin: null })).toBe(true);
	});

	it('Content-Type のない POST も、form と同じに扱う', () => {
		expect(isCsrfForbidden({ ...base, contentType: null, origin: null })).toBe(true);
	});

	it('JSON と GET は、Origin を見ない', () => {
		expect(isCsrfForbidden({ ...base, contentType: 'application/json', origin: null })).toBe(false);
		expect(isCsrfForbidden({ ...base, method: 'GET', origin: null })).toBe(false);
	});

	it('OAuth のトークンエンドポイントでは Origin のないフォーム送信を許可する', () => {
		expect(isCsrfForbidden({ ...base, path: '/oauth/token', origin: null })).toBe(false);
		expect(isCsrfForbidden({ ...base, path: '/oauth/authorize', origin: null })).toBe(true);
	});

	it('公開 API と MCP は、Bearer のトークンだけで認証するので、本文なしの DELETE や POST も通す', () => {
		for (const path of [
			'/api/v1/events/3',
			'/api/v1/notifications/read',
			'/api/v1/notifications/3/read',
			'/mcp',
		]) {
			for (const method of ['DELETE', 'POST', 'PUT']) {
				expect(isCsrfForbidden({ ...base, method, path, contentType: null, origin: null })).toBe(
					false,
				);
			}
		}
	});

	it('Cookie で認証する /api の口 (ログインなど) と、似た名前の口は、断ったまま', () => {
		for (const path of ['/api/auth/logout', '/api/v1x/events', '/mcpx', '/api']) {
			expect(isCsrfForbidden({ ...base, path, contentType: null, origin: null })).toBe(true);
		}
	});
});
