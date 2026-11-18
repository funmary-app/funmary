// 消えたリリースの復元で、ビルドし直したファイルを、作り直した項目に置く (restore-releases.yml の 2 つ目のジョブ、Issue #222)。
// リリースにしたコミットを checkout し、そのコミット自身の設定でビルドしたあとに動かす。古いコミットでは、リリースに添えるファイルの一部を作らないことがあるので、できたものだけを置く。
// 環境変数: HEAD_SHA (リリースにしたコミット)、GH_TOKEN (gh が使う)、GITHUB_REPOSITORY (owner/repo)
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { releaseVersion } from './release-version.js';

const version = releaseVersion(process.env['HEAD_SHA'] ?? '');
const repo = process.env['GITHUB_REPOSITORY'] ?? '';
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
	throw new Error('GITHUB_REPOSITORY が owner/repo の形ではありません');
}

// そのコミットの package.json のスクリプトで、tar.gz などを作る
execFileSync('pnpm', ['package-release', version], { stdio: 'inherit' });

const files = [
	`release/funmary-${version}.tar.gz`,
	`release/funmary-${version}.tar.gz.sha256`,
	'release/build-hash.txt',
	'release/THIRD_PARTY_LICENSES.txt',
].filter((file) => existsSync(file));
if (!files.some((file) => file.endsWith('.tar.gz'))) {
	throw new Error(`${version} の tar.gz を作れませんでした`);
}
execFileSync('gh', ['release', 'upload', version, ...files, '--repo', repo, '--clobber'], {
	stdio: 'inherit',
});
console.log(`${version} に、${files.length} 個のファイルを置きました`);
