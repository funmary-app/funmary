import { describe, expect, it } from 'vitest';
import { legacyAppPath } from './legacy-path.ts';

describe('legacyAppPath', () => {
	it('/app に移す前の画面の URL を、/app の下の同じ画面の URL にする', () => {
		expect(legacyAppPath('/week')).toBe('/app/week');
		expect(legacyAppPath('/courses')).toBe('/app/courses');
		expect(legacyAppPath('/courses/import')).toBe('/app/courses/import');
		expect(legacyAppPath('/subjects/12')).toBe('/app/subjects/12');
		expect(legacyAppPath('/admin')).toBe('/app/admin');
		expect(legacyAppPath('/admin/calendar')).toBe('/app/admin/calendar');
	});

	it('設定の下にあった「リポジトリと作者」の画面の URL を、ルートの下の URL にする', () => {
		expect(legacyAppPath('/app/settings/about')).toBe('/about');
		expect(legacyAppPath('/app/settings/license')).toBe('/license');
		expect(legacyAppPath('/app/settings/third-party-licenses')).toBe('/third-party-licenses');
		expect(legacyAppPath('/app/settings/contributors')).toBe('/contributors');
		expect(legacyAppPath('/app/settings')).toBeNull();
		expect(legacyAppPath('/app/settings/discord')).toBeNull();
	});

	it('移していない URL と、名前が前方だけ同じ URL は、転送しない', () => {
		expect(legacyAppPath('/')).toBeNull();
		expect(legacyAppPath('/login')).toBeNull();
		expect(legacyAppPath('/app/week')).toBeNull();
		expect(legacyAppPath('/weekly')).toBeNull();
		expect(legacyAppPath('/auth/google')).toBeNull();
	});
});
