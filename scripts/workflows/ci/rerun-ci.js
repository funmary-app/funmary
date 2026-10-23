// PR のコメントで !ignore_ci と頼まれたら、その PR の CI を動かし直す (ci-ignore.yml)。
// 動かし直した CI では、skip ジョブがコメントを読んで、重い検査を飛ばす。所有者とメンテナーの頼みだけを受ける。
// 環境変数: GITHUB_TOKEN、GITHUB_REPOSITORY、PR_NUMBER、COMMENTER
import { canRequestSkip, github, roleOf } from './ci-skip.js';

const repository = process.env['GITHUB_REPOSITORY'] ?? '';
const number = process.env['PR_NUMBER'] ?? '';
const commenter = process.env['COMMENTER'] ?? '';

if (!canRequestSkip(await roleOf(repository, commenter))) {
	console.log(`${commenter} は所有者でもメンテナーでもないので、CI を動かし直しません`);
	process.exit(0);
}

/** @typedef {{ id: number, status: string, html_url: string }} WorkflowRun */
/** @type {{ head: { sha: string } }} */
const pull = await github(`/repos/${repository}/pulls/${number}`);
/** @type {{ workflow_runs: WorkflowRun[] }} */
const { workflow_runs: runs } = await github(
	`/repos/${repository}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${pull.head.sha}&per_page=1`,
);
const run = runs[0];
if (!run) {
	console.log('この PR の最新のコミットの CI が見つからないので、動かし直しません');
	process.exit(0);
}

// 動いている実行は、止めてからでないと動かし直せない
if (run.status !== 'completed') {
	await github(`/repos/${repository}/actions/runs/${run.id}/cancel`, { method: 'POST' });
	for (let i = 0; i < 60; i++) {
		/** @type {WorkflowRun} */
		const current = await github(`/repos/${repository}/actions/runs/${run.id}`);
		if (current.status === 'completed') break;
		await new Promise((resolve) => setTimeout(resolve, 5000));
	}
}
await github(`/repos/${repository}/actions/runs/${run.id}/rerun`, { method: 'POST' });
console.log(`CI を動かし直しました: ${run.html_url}`);
