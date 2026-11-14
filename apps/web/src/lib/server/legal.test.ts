import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findLegalInfo } from './legal.ts';

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'funmary-legal-'));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe('findLegalInfo', () => {
	it('上の階層へたどって legal/ を見つけて読む', () => {
		const legal = join(dir, 'legal');
		mkdirSync(legal, { recursive: true });
		writeFileSync(join(legal, 'LICENSE-BSD-3-CLAUSE'), 'BSD の本文');
		writeFileSync(join(legal, 'LICENSE-APACHE'), 'Apache の本文');
		writeFileSync(join(legal, 'LICENSE-ASSETS'), 'ロゴとアイコンの本文');
		writeFileSync(join(legal, 'THIRD_PARTY_LICENSES.txt'), '依存の一覧');

		const deep = join(dir, 'build', 'server', 'chunks');
		mkdirSync(deep, { recursive: true });

		expect(findLegalInfo(deep)).toEqual({
			licenses: [
				{ file: 'LICENSE-BSD-3-CLAUSE', text: 'BSD の本文' },
				{ file: 'LICENSE-APACHE', text: 'Apache の本文' },
				{ file: 'LICENSE-ASSETS', text: 'ロゴとアイコンの本文' },
			],
			thirdPartyLicenses: '依存の一覧',
		});
	});

	it('なければ null (手元の開発)', () => {
		expect(findLegalInfo(dir)).toBeNull();
	});
});
