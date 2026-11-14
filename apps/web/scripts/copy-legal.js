// LICENSE と、依存のライセンス一覧を、ビルドしたサーバーの隣に写す。vite build のあとに動かす。
// サーバーのコードは 1 つにまとめられるので、リポジトリのルートの LICENSE-* を実行時に読めない。
// #lib/server/legal.ts が、自分から見た ../legal を探す (copy-migrations.js と同じ考え方)。
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateThirdPartyLicenses } from '../../../scripts/third-party-licenses.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const licenseFiles = ['LICENSE-BSD-3-CLAUSE', 'LICENSE-APACHE', 'LICENSE-ASSETS'];
const targets = [
	// vite preview (E2E テスト) が使う出力
	'../.svelte-kit/output/server/legal',
	// adapter-node が作る、本番で動かす出力
	'../build/server/legal',
];

const thirdPartyLicenses = generateThirdPartyLicenses(root);

for (const target of targets) {
	const dir = fileURLToPath(new URL(target, import.meta.url));
	if (!existsSync(dirname(dir))) {
		throw new Error(
			`ビルドの出力がありません。先に vite build を動かしてください: ${dirname(dir)}`,
		);
	}
	mkdirSync(dir, { recursive: true });
	for (const file of licenseFiles) cpSync(join(root, file), join(dir, file));
	writeFileSync(join(dir, 'THIRD_PARTY_LICENSES.txt'), thirdPartyLicenses);
}
