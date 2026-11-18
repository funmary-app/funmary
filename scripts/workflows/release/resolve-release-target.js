import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { selectReleaseTarget } from './release-target.js';
import { releaseVersion } from './release-version.js';

/** @param {string[]} args */
function git(args) {
	return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const input = (process.env['RELEASE_TARGET_INPUT'] ?? '').trim();
const repo = process.env['GITHUB_REPOSITORY'] ?? '';
const apiUrl = process.env['GITHUB_API_URL'] ?? '';
const token = process.env['GH_TOKEN'] ?? '';
const envFile = process.env['GITHUB_ENV'];
if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !apiUrl || !token || !envFile) {
	throw new Error('対象コミットの選択には GitHub Actions の環境変数と GH_TOKEN が必要です。');
}

const candidates = input
	? [git(['rev-parse', '--verify', '--end-of-options', `${input}^{commit}`])]
	: git(['rev-list', '--first-parent', 'HEAD']).split(/\r?\n/);
const buildTags = new Set(git(['tag', '--list', 'build-*']).split(/\r?\n/));
const target = await selectReleaseTarget(candidates, async (sha) => {
	const tag = releaseVersion(sha);
	if (!buildTags.has(tag) || git(['rev-parse', `refs/tags/${tag}^{commit}`]) !== sha) return false;

	const response = await fetch(`${apiUrl}/repos/${repo}/releases/tags/${tag}`, {
		headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
		signal: AbortSignal.timeout(10_000),
	});
	if (response.status === 404) return false;
	if (!response.ok) {
		throw new Error(`${tag} を確認できませんでした (GitHub API の HTTP ${response.status})。`);
	}
	const release = /** @type {{ draft: boolean }} */ (await response.json());
	return release.draft === false;
});

if (!target) {
	throw new Error(
		input
			? `指定したコミット ${input} に対応する公開済みビルドがありません。`
			: 'このブランチの履歴に公開済みビルドがありません。',
	);
}
appendFileSync(envFile, `TARGET_SHA=${target}\n`);
console.log(`節目の版の対象は ${releaseVersion(target)} (コミット ${target}) です。`);
