// PR の CI で、重い検査 (検査とビルド、E2E) を飛ばすかを決める (ci.yml)。
// 文書だけの変更か、所有者かメンテナーが PR のタイトル、本文、コメントに !ignore_ci と書いたときに飛ばす。
// 判定に失敗したら飛ばさない (すべて動かす)。
// 環境変数: GITHUB_TOKEN、GITHUB_REPOSITORY、GITHUB_OUTPUT、PR_NUMBER、PR_AUTHOR、PR_TITLE、PR_BODY
import { appendFileSync } from 'node:fs';

export const SKIP_KEYWORD = '!ignore_ci';

// main への push の paths-ignore (ci.yml、windows.yml) と同じ範囲にする
const DOCS = [/\.md$/, /^docs\//, /^\.github\/ISSUE_TEMPLATE\//];

/**
 * 変更したファイルが、すべて文書か
 * @param {string[]} files リポジトリのルートからのパス
 * @returns {boolean}
 */
export function isDocsOnly(files) {
	return files.length > 0 && files.every((file) => DOCS.some((pattern) => pattern.test(file)));
}

/**
 * !ignore_ci で CI を飛ばせる人か。外部の人や、書き込みの権限だけの人は飛ばせない
 * @param {string | undefined} role リポジトリでの役割 (collaborators/{user}/permission の role_name)
 * @returns {boolean}
 */
export function canRequestSkip(role) {
	return role === 'admin' || role === 'maintain';
}

/**
 * @param {{
 *   files: string[],
 *   requests: { author: string, text: string }[],
 *   roles: Record<string, string>,
 * }} input requests は PR のタイトルと本文 (作者は PR の作者) と、コメント
 * @returns {{ skip: boolean, reason: string }}
 */
export function decideSkip({ files, requests, roles }) {
	if (isDocsOnly(files))
		return { skip: true, reason: '文書だけの変更なので、重い検査を飛ばします' };
	const request = requests.find(
		({ author, text }) => text.includes(SKIP_KEYWORD) && canRequestSkip(roles[author]),
	);
	if (request)
		return {
			skip: true,
			reason: `${request.author} が ${SKIP_KEYWORD} と書いたので、重い検査を飛ばします`,
		};
	return { skip: false, reason: 'すべての検査を動かします' };
}

/**
 * GitHub の API を、ページをたどってすべて読む
 * @template T
 * @param {string} path `/repos/...` から
 * @returns {Promise<T[]>}
 */
export async function githubList(path) {
	/** @type {T[]} */
	const items = [];
	for (let page = 1; ; page++) {
		const separator = path.includes('?') ? '&' : '?';
		/** @type {T[]} */
		const batch = await github(`${path}${separator}per_page=100&page=${page}`);
		items.push(...batch);
		if (batch.length < 100) return items;
	}
}

/**
 * 返す値の形は、呼ぶ側が API の文書に合わせて決める
 * @template T
 * @param {string} path
 * @param {RequestInit} [init]
 * @returns {Promise<T>}
 */
export async function github(path, init = {}) {
	const response = await fetch(`https://api.github.com${path}`, {
		...init,
		headers: {
			accept: 'application/vnd.github+json',
			authorization: `Bearer ${process.env['GITHUB_TOKEN'] ?? ''}`,
			'x-github-api-version': '2022-11-28',
		},
	});
	if (!response.ok) throw new Error(`GitHub の API が ${response.status} を返しました: ${path}`);
	return /** @type {Promise<T>} */ (response.status === 204 ? null : response.json());
}

/**
 * リポジトリでの役割を調べる。調べられなければ undefined (飛ばせない人として扱う)
 * @param {string} repository
 * @param {string} user
 * @returns {Promise<string | undefined>}
 */
export async function roleOf(repository, user) {
	try {
		/** @type {{ role_name: string }} */
		const permission = await github(`/repos/${repository}/collaborators/${user}/permission`);
		return permission.role_name;
	} catch {
		return undefined;
	}
}

async function main() {
	const repository = process.env['GITHUB_REPOSITORY'] ?? '';
	const number = process.env['PR_NUMBER'] ?? '';
	/** @type {{ filename: string }[]} */
	const changed = await githubList(`/repos/${repository}/pulls/${number}/files`);
	const files = changed.map((file) => file.filename);
	/** @type {{ user: { login: string }, body: string | null }[]} */
	const comments = await githubList(`/repos/${repository}/issues/${number}/comments`);
	const requests = [
		{
			author: process.env['PR_AUTHOR'] ?? '',
			text: `${process.env['PR_TITLE'] ?? ''}\n${process.env['PR_BODY'] ?? ''}`,
		},
		...comments.map((comment) => ({ author: comment.user.login, text: comment.body ?? '' })),
	];
	// 役割を調べるのは、!ignore_ci と書いた人だけにする
	const authors = [
		...new Set(
			requests.filter(({ text }) => text.includes(SKIP_KEYWORD)).map(({ author }) => author),
		),
	];
	/** @type {Record<string, string>} */
	const roles = {};
	for (const author of authors) {
		const role = await roleOf(repository, author);
		if (role) roles[author] = role;
	}
	return decideSkip({ files, requests, roles });
}

if (import.meta.main) {
	let result;
	try {
		result = await main();
	} catch (error) {
		console.log(
			`::warning::CI を飛ばすかを決められなかったので、すべて動かします: ${String(error)}`,
		);
		result = { skip: false };
	}
	if (result.reason) console.log(result.reason);
	appendFileSync(process.env['GITHUB_OUTPUT'] ?? '/dev/stdout', `skip=${result.skip}\n`);
}
