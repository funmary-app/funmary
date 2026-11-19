// release/ にあるリリースの tar.gz を、GitHub Releases に置く (release.yml)。tar.gz は CI が pnpm package-release で作る。
// 環境変数: HEAD_SHA (リリースにするコミット)、GH_TOKEN (gh が使う)、GITHUB_REPOSITORY (owner/repo)
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { releaseNotesFromGit } from './git-release-notes.js';
import { releaseVersion } from './release-version.js';

const sha = process.env['HEAD_SHA'] ?? '';
const version = releaseVersion(sha);
const repo = process.env['GITHUB_REPOSITORY'] ?? '';
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
	throw new Error(`GITHUB_REPOSITORY を owner/repo の形で渡してください: ${JSON.stringify(repo)}`);
}

const notes = releaseNotesFromGit({ repo, version, sha });

writeFileSync('release/notes.md', notes);
console.log(`リリースノート:\n${notes}`);

// 同じ版を作り直したときは、置き換える
try {
	execFileSync('gh', ['release', 'delete', version, '--cleanup-tag', '--yes'], { stdio: 'ignore' });
} catch {
	// まだなければ、消すものがないだけ
}
execFileSync(
	'gh',
	[
		'release',
		'create',
		version,
		'--target',
		sha,
		'--title',
		version,
		'--notes-file',
		'release/notes.md',
		'--prerelease',
		`release/funmary-${version}.tar.gz`,
		`release/funmary-${version}.tar.gz.sha256`,
		'release/build-hash.txt',
		'release/THIRD_PARTY_LICENSES.txt',
	],
	{ stdio: 'inherit' },
);
console.log(`${version} を GitHub Releases に置きました`);
