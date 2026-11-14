// LICENSE の本文と、依存のライセンス一覧。scripts/copy-legal.js がビルドの出力に写した legal/ フォルダを、
// 起動時に上の階層へたどって探し、1 回だけ読む (build-info.ts と同じ考え方)。
// 手元の TypeScript のまま動かす開発では見つからないので null (設定の画面では、その旨を出す)
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** 何階層まで上へたどるか */
const MAX_LEVELS = 4;
const LICENSE_FILES = ['LICENSE-BSD-3-CLAUSE', 'LICENSE-APACHE', 'LICENSE-ASSETS'] as const;

export interface LegalInfo {
	licenses: { file: string; text: string }[];
	thirdPartyLicenses: string;
}

function findLegalFolder(from: string): string | undefined {
	let dir = from;
	for (let level = 0; level <= MAX_LEVELS; level++) {
		const candidate = join(dir, 'legal');
		if (existsSync(join(candidate, 'THIRD_PARTY_LICENSES.txt'))) return candidate;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return undefined;
}

/** startDir から上へたどって legal/ を読む。なければ (手元の開発)、または読めなければ null */
export function findLegalInfo(startDir: string): LegalInfo | null {
	const folder = findLegalFolder(startDir);
	if (!folder) return null;
	try {
		return {
			licenses: LICENSE_FILES.map((file) => ({
				file,
				text: readFileSync(join(folder, file), 'utf8'),
			})),
			thirdPartyLicenses: readFileSync(join(folder, 'THIRD_PARTY_LICENSES.txt'), 'utf8'),
		};
	} catch {
		return null;
	}
}
