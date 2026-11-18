// 配布ファイルの中のディレクトリ名にはタグ名が入るため、build-<hash> 向けの成果物は v* 向けに作り直す。
// 実行前に pnpm build を済ませる。VERSION_INPUT は patch、minor、major または X.Y.Z、TARGET_SHA はタグを付けるコミット。
// GitHub の操作には GH_TOKEN と GITHUB_REPOSITORY を使う。
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { releaseNotesFromGit } from './git-release-notes.js';
import { nextVersionTag } from './release-tag-version.js';

/**
 * @param {string} command
 * @param {string[]} args
 */
const run = (command, args) =>
	execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const input = process.env['VERSION_INPUT'] ?? '';
const sha = process.env['TARGET_SHA'] ?? '';
if (!/^[0-9a-f]{7,40}$/.test(sha)) {
	throw new Error(`TARGET_SHA をコミットの hash として読めません: ${JSON.stringify(sha)}`);
}
const repo = process.env['GITHUB_REPOSITORY'] ?? '';
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
	throw new Error(`GITHUB_REPOSITORY を owner/repo の形で渡してください: ${JSON.stringify(repo)}`);
}

/** 直前の v* タグ (sha より前にあるもの)。なければ null */
function previousVersionTag() {
	try {
		return run('git', [
			'describe',
			'--tags',
			'--abbrev=0',
			'--first-parent',
			'--match',
			'v*',
			`${sha}~1`,
		]);
	} catch {
		return null;
	}
}

const version = nextVersionTag(input, previousVersionTag());

// すでにこの版のタグがあれば断る (節目のタグは、作り直さず、残したままにする)
try {
	run('git', ['rev-parse', '--verify', `refs/tags/${version}`]);
	throw new Error(`タグ ${version} はすでにあります。別の版にするか、先に消してください。`);
} catch (error) {
	if (error instanceof Error && error.message.includes('はすでにあります')) throw error;
	// rev-parse が失敗した (タグがない) だけなら、続ける
}

// 自動のビルドのリリース (build-<hash>) があるコミットは、CI を通って反映まで済んでいる。それ以外には節目を付けない
const buildRelease = `build-${sha.slice(0, 7)}`;
try {
	run('gh', ['release', 'view', buildRelease, '--json', 'tagName']);
} catch {
	throw new Error(
		`コミット ${sha} に ${buildRelease} のリリースがありません。CI が通ったコミットを指定してください。`,
	);
}

console.log(`${version} を作ります (コミット ${sha})`);

const notes = releaseNotesFromGit({ repo, version, sha, tagMatch: 'v*' });

// pnpm は Linux の Actions で動かすので、シェルを通さずに呼べる
execFileSync('pnpm', ['package-release', version], { stdio: 'inherit' });

writeFileSync('release/notes.md', notes);
console.log(`リリースノート:\n${notes}`);

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
		`release/funmary-${version}.tar.gz`,
		`release/funmary-${version}.tar.gz.sha256`,
		'release/build-hash.txt',
		'release/THIRD_PARTY_LICENSES.txt',
	],
	{ stdio: 'inherit' },
);
console.log(`${version} を GitHub Releases に置きました (節目の版なので prerelease は付けない)`);
