// 本番の環境変数ファイルを、手元の .env に合わせる (VPS にログインせず、1 つのコマンドで済ませる)。
// 使い方: pnpm env:upload
// SSH の接続先は .env.ssh に書く (scripts/vps-ssh.js)。
//
// 反映専用の制限された鍵 (funmary-deploy、command= で funmary-update だけに絞ったもの) は使わない。
// 作者自身の SSH 鍵と sudo を使う (自動デプロイの経路とは別)。
//
// 1. 使わなくなった鍵 (RETIRED_NAMES) がリモートに残っていれば、消すか確認する
// 2. リモートの環境変数ファイルを .env.example の並びに揃える (足りない鍵を空のまま足す。値は変えない)
// 3. 手元の .env にあって、リモートにない値、またはリモートと違う値だけを、1 つずつ上書きするか確認する
//    (どちらにもない鍵、リモートにしかない鍵には触れない)
// 4. 値を上書きしたら、いま再起動するか確認し、再起動したら動いているかを確かめる
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import {
	alignEnvFile,
	parseEnvValues,
	removeEnvKeys,
	RETIRED_NAMES,
	SECRET_NAMES,
	setEnvValues,
} from '../apps/web/src/lib/server/env-file.ts';
import {
	loadSshConfig,
	parseWriteResult,
	reportRestart,
	runSsh,
	shellQuote as quote,
	writeFileCommand,
} from './vps-ssh.js';

const { ssh: sshConfig, remoteEnvFile: remoteFile } = loadSshConfig();
const { host } = sshConfig;

if (!existsSync('.env')) throw new Error('.env がありません (pnpm funmary-admin init で作れます)');
if (!existsSync('.env.example')) throw new Error('.env.example が見つかりません');
const localText = readFileSync('.env', 'utf8');
const templateText = readFileSync('.env.example', 'utf8');

console.log(`${host} の ${remoteFile} を読んでいます…`);
const remoteText = runSsh(sshConfig, ['sudo', 'cat', quote(remoteFile)]);

// 使わなくなった鍵は、揃える前に消す (揃えると「.env.example にない鍵」として残るため)
let cleanedText = remoteText;
const retired = RETIRED_NAMES.filter((name) => parseEnvValues(remoteText).has(name));
if (retired.length > 0) {
	console.log(`\n使わなくなった鍵が残っています: ${retired.join(', ')}`);
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await rl.question('  これらの鍵を消しますか? (y/N): ');
	rl.close();
	if (/^y(es)?$/i.test(answer.trim())) cleanedText = removeEnvKeys(remoteText, retired).text;
}

// まず、リモートの並びと足りない鍵を .env.example に揃える (値のある行の値は変えない)
const structured = alignEnvFile(cleanedText, templateText);
if (structured.added.length > 0) {
	console.log(`空のまま足す鍵: ${structured.added.join(', ')}`);
}
if (structured.extra.length > 0) {
	console.log(`.env.example にない鍵 (そのまま残す): ${structured.extra.join(', ')}`);
}

// 手元の .env と、揃えたあとのリモートの値を見比べる
const localValues = parseEnvValues(localText);
const remoteValues = parseEnvValues(structured.text);
/** @type {{ key: string, local: string, remote: string }[]} */
const changed = [];
/** @type {string[]} */
const skippedSecrets = [];
for (const [key, local] of localValues) {
	if (local === '') continue; // 手元でも空なら、上書きの提案はしない
	const remote = remoteValues.get(key) ?? '';
	if (local === remote) continue;
	// 鍵は環境ごとに別であるべきもの。上書きすると暗号化したデータが読めなくなるなど、事故につながるので候補にも出さない
	if (/** @type {readonly string[]} */ (SECRET_NAMES).includes(key)) {
		skippedSecrets.push(key);
		continue;
	}
	changed.push({ key, local, remote });
}
if (skippedSecrets.length > 0) {
	console.log(
		`\n手元と VPS で値が違いますが、上書きの対象外なのでスキップしました (環境ごとに別であるべき鍵): ${skippedSecrets.join(', ')}`,
	);
}

/** @type {Map<string, string>} */
const overrides = new Map();
if (changed.length > 0) {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		console.log(
			`\n手元の .env と値が違う、またはリモートにない鍵が ${changed.length} 件あります。`,
		);
		for (const [i, { key, local, remote }] of changed.entries()) {
			console.log(`\n[${i + 1}/${changed.length}] ${key}`);
			console.log(`  手元: ${local}`);
			console.log(`  VPS : ${remote === '' ? '(未設定)' : remote}`);
			const answer = await rl.question('  手元の値で上書きしますか? (y/N): ');
			if (/^y(es)?$/i.test(answer.trim())) overrides.set(key, local);
		}
	} finally {
		rl.close();
	}
} else {
	console.log('手元の .env と値の違いはありません。');
}

if (overrides.size === 0 && structured.text === remoteText) {
	console.log('\n変えるものがないので、何もしていません。');
	process.exit(0);
}

const finalText = setEnvValues(structured.text, overrides);

// 値を変えたときだけ、再起動するか聞く (並びを揃えただけなら、動きは変わらない)。
// 利用者の少ない時間に後で再起動したいこともあるので、聞かずには再起動しない。
// 書き換えと同じ接続で再起動できるよう、書き換える前に聞く (パスフレーズを聞かれる回数を減らすため)
let restart = false;
if (overrides.size > 0) {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await rl.question(
		'\n書き換えたあと、変えた値を反映するため、Funmary を再起動しますか? (y/N): ',
	);
	rl.close();
	restart = /^y(es)?$/i.test(answer.trim());
}

const backupPath = `${remoteFile}.bak.${new Date().toISOString().replaceAll(/[:.]/g, '-')}`;
console.log(
	`\n${host} の ${remoteFile} を ${backupPath} に控えてから書き換えます${restart ? '。そのあと Funmary を再起動します' : ''}…`,
);
let output;
try {
	output = runSsh(sshConfig, [
		writeFileCommand({ file: remoteFile, backup: backupPath, content: finalText, restart }),
	]);
} catch (error) {
	// 再起動のあとに動いていなければ、is-active が 0 以外で終わる。書き換えが済んだかは、出力から読む
	output = error instanceof Error && 'stdout' in error ? String(error.stdout) : '';
}
const result = parseWriteResult(output);
if (!result.written) {
	console.error(
		`${remoteFile} を書き換えられませんでした。控えは ${backupPath} にあるか、まだ作られていません。`,
	);
	process.exit(1);
}
console.log(
	`書き換えました。上書きした鍵: ${overrides.size > 0 ? [...overrides.keys()].join(', ') : 'なし'}`,
);
if (restart) {
	if (!reportRestart(result.state)) process.exitCode = 1;
} else if (overrides.size > 0) {
	console.log('本番に反映するには、あとで再起動してください: pnpm vps:restart');
}
