// 消えたリリースの復元の、計画とリリースの項目の作り直し (restore-releases.yml の最初のジョブ、Issue #222)。
// これまでの Release の実行のログから、各回のコミットを取り出し、リリースの項目が残っていないものについて、リリースノート付きの項目を古い順に作る (添付のファイルは、次のジョブが各コミットをビルドし直して置く)。
//
// タグは、先に作者が手元のクローンから push しておく (消える前に取り込んだタグが残っている)。GITHUB_TOKEN では、今の main とワークフローのファイルが違う古いコミットにタグを作れない (参照の API でもリリースの API でも、ワークフローの変更として扱われ、workflows の権限が要る)。そのため、ここでは既存のタグに項目を作るだけにする。
// 環境変数: GH_TOKEN (gh が使う)、GITHUB_REPOSITORY (owner/repo)、GITHUB_OUTPUT (Actions が設定する)、DRY_RUN (true なら、項目を作らずに計画だけを出す)
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { releaseNotesFromGit } from './git-release-notes.js';
import { extractReleasedSha, planRestore } from './restore-plan.js';

const repo = process.env['GITHUB_REPOSITORY'] ?? '';
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
	throw new Error('GITHUB_REPOSITORY が owner/repo の形ではありません');
}
const dryRun = process.env['DRY_RUN'] === 'true';

/** @param {string[]} args */
const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

/** @type {unknown} */
const runPages = JSON.parse(
	gh([
		'api',
		'--paginate',
		'--slurp',
		`repos/${repo}/actions/workflows/release.yml/runs?status=success&per_page=100`,
	]),
);
const runIds = /** @type {{ workflow_runs: { id: number }[] }[]} */ (runPages).flatMap((page) =>
	page.workflow_runs.map((run) => run.id),
);

/** @type {string[]} */
const releasedShas = [];
for (const id of runIds) {
	const sha = extractReleasedSha(gh(['run', 'view', String(id), '--repo', repo, '--log']));
	if (sha) releasedShas.push(sha);
	else console.warn(`Release の実行 ${id} のログから、コミットを取り出せませんでした`);
}

/** @param {string} path @returns {Set<string>} */
function namesFrom(path) {
	/** @type {unknown} */
	const pages = JSON.parse(gh(['api', '--paginate', '--slurp', path]));
	const items = /** @type {{ name?: string; tag_name?: string }[][]} */ (pages).flat();
	return new Set(items.map((item) => item.name ?? item.tag_name ?? ''));
}
const existingTags = namesFrom(`repos/${repo}/tags?per_page=100`);
const existingReleases = namesFrom(`repos/${repo}/releases?per_page=100`);

const plan = planRestore(releasedShas, existingReleases);
console.log(
	`Release の実行 ${runIds.length} 回、リリースにしたコミット ${new Set(releasedShas).size} 個のうち、${plan.length} 個を復元します`,
);
for (const { sha, version } of plan) console.log(`${version} ${sha}`);

const withoutTag = plan.filter(({ version }) => !existingTags.has(version));
if (withoutTag.length > 0) {
	const message = `タグがないものが ${withoutTag.length} 個あります。先に、タグの残っているクローンから push してください: ${withoutTag.map(({ version }) => version).join(' ')}`;
	if (!dryRun) throw new Error(message);
	console.warn(message);
}

if (!dryRun) {
	const notesDir = mkdtempSync(join(tmpdir(), 'restore-notes-'));
	for (const { sha, version } of plan) {
		const notesFile = join(notesDir, `${version}.md`);
		writeFileSync(notesFile, releaseNotesFromGit({ repo, version, sha }));
		// 既存のタグに作る (--verify-tag で、タグがなければ作らずに失敗する)。ふだんの Release と同じく、正式でない版 (prerelease) にし、「最新」の印を付けない
		gh([
			'release',
			'create',
			version,
			'--repo',
			repo,
			'--verify-tag',
			'--title',
			version,
			'--notes-file',
			notesFile,
			'--prerelease',
			'--latest=false',
		]);
		console.log(`${version} の項目を作りました`);
	}
}

appendFileSync(process.env['GITHUB_OUTPUT'] ?? '/dev/null', `plan=${JSON.stringify(plan)}\n`);
