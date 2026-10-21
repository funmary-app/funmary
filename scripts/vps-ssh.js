// 作者自身の SSH 鍵で VPS に入るための部品 (pnpm env:upload と pnpm vps:restart が使う)。
// 接続先 (宛先、鍵、ポート) は、コマンドの引数ではなく .env.ssh に書く
// (シェルの履歴やプロセス一覧に、接続先や鍵の場所を残さないため)。形は .env.ssh.example を見る。
//
// パスフレーズは ssh が端末で聞く。そのため ssh の標準入力と標準エラーは、つなぎ替えずに端末のまま渡す
// (つなぎ替えると、ssh が端末を開けずに、正しく打っても失敗したり、聞かれる文が見えなくなったりする)。
// VPS に送る中身は標準入力に流さず、Base64 にしてコマンドに含める。
// Windows では、Git for Windows の ssh より、Windows の OpenSSH を優先する (Node.js から起動しても、端末で聞けるため)。
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * @typedef {object} SshConfig
 * @property {string} host ユーザー名を含む宛先 (例: root@funmary.example.com)
 * @property {string} [port]
 * @property {string} [key] 秘密鍵のパス
 * @property {string} bin 使う ssh のコマンド
 */

/** Windows の OpenSSH の場所 */
const WINDOWS_OPENSSH = 'C:\\Windows\\System32\\OpenSSH\\ssh.exe';

/**
 * 使う ssh を決める。SSH_BIN を書いていればそれを、Windows なら Windows の OpenSSH を、ほかは PATH の ssh を使う
 * @param {{ sshBin?: string | undefined; platform: string; exists: (path: string) => boolean }} input
 * @returns {string}
 */
export function resolveSshBin({ sshBin, platform, exists }) {
	if (sshBin) return sshBin;
	if (platform === 'win32' && exists(WINDOWS_OPENSSH)) return WINDOWS_OPENSSH;
	return 'ssh';
}

/**
 * @param {Omit<SshConfig, 'bin'>} config
 * @param {readonly string[]} remote VPS で動かすコマンド
 * @returns {string[]}
 */
export function sshArgs(config, remote) {
	return [
		// 鍵が見つからなくても、パスワード認証に黙って切り替えず、設定の誤りとして止める。
		// 鍵のパスフレーズは認証方式の選択とは別なので、これまでどおり端末で聞かれる
		'-o',
		'PreferredAuthentications=publickey',
		// 鍵を書いたときは、その鍵だけを使う (ssh-agent のほかの鍵を順に試して、回数制限で断られないように)
		...(config.key ? ['-o', 'IdentitiesOnly=yes'] : []),
		...(config.port ? ['-p', config.port] : []),
		...(config.key ? ['-i', config.key] : []),
		config.host,
		...remote,
	];
}

/**
 * VPS のシェルに渡す値を、1 つの語として ' で囲む (中の ' は '\'' にする)
 * @param {string} value
 * @returns {string}
 */
export function shellQuote(value) {
	return `'${value.replaceAll("'", String.raw`'\''`)}'`;
}

/** Funmary を再起動し、少し待ってから状態を出す VPS のコマンド (起動の直後に落ちることもあるので待つ) */
export const RESTART_COMMAND =
	'sudo systemctl restart funmary && sleep 3; systemctl is-active funmary';

/** 書き込みが済んだことを示す印。再起動の結果と見分けるために出す */
const WRITTEN_MARK = '__funmary_written__';

/**
 * ファイルを控えてから書き換え、頼まれれば Funmary を再起動する VPS のコマンド (1 回の接続で済ませる)。
 * 中身は Base64 にしてコマンドに含める。既存のファイルに上書きするので、所有者と権限は変わらない
 * @param {{ file: string; backup: string; content: string; restart: boolean }} input
 * @returns {string}
 */
export function writeFileCommand({ file, backup, content, restart }) {
	const base64 = Buffer.from(content, 'utf8').toString('base64');
	const write = `sudo cp -p ${shellQuote(file)} ${shellQuote(backup)} && printf %s ${shellQuote(base64)} | base64 -d | sudo tee ${shellQuote(file)} > /dev/null && echo ${WRITTEN_MARK}`;
	return restart ? `${write} && { ${RESTART_COMMAND}; }` : write;
}

/**
 * writeFileCommand の出力を読む
 * @param {string} stdout
 * @returns {{ written: boolean; state: string | null }} state は再起動のあとの状態 (再起動しなければ null)
 */
export function parseWriteResult(stdout) {
	const lines = stdout.split(/\r?\n/).map((line) => line.trim());
	const markIndex = lines.indexOf(WRITTEN_MARK);
	if (markIndex < 0) return { written: false, state: null };
	const state = lines.slice(markIndex + 1).find((line) => line !== '') ?? null;
	return { written: true, state };
}

/** .env.ssh を読む。なければ、作り方を示して止める */
export function loadSshConfig() {
	if (!existsSync('.env.ssh')) {
		console.error(
			'.env.ssh がありません。.env.ssh.example を .env.ssh に写し、接続先を書いてください。',
		);
		process.exit(1);
	}
	process.loadEnvFile('.env.ssh');
	const host = process.env['SSH_HOST'];
	if (!host)
		throw new Error('.env.ssh に SSH_HOST を書いてください (例: root@funmary.example.com)');
	const port = process.env['SSH_PORT'];
	const key = process.env['SSH_KEY'];
	const bin = resolveSshBin({
		sshBin: process.env['SSH_BIN'],
		platform: process.platform,
		exists: existsSync,
	});
	return {
		/** @type {SshConfig} */
		ssh: { host, bin, ...(port ? { port } : {}), ...(key ? { key } : {}) },
		remoteEnvFile: process.env['REMOTE_ENV_FILE'] || '/etc/funmary/funmary.env',
	};
}

/**
 * VPS でコマンドを動かし、標準出力を返す。パスフレーズは ssh が端末で聞く
 * @param {SshConfig} config
 * @param {readonly string[]} remote
 * @returns {string}
 */
export function runSsh(config, remote) {
	try {
		return execFileSync(config.bin, sshArgs(config, remote), {
			encoding: 'utf8',
			// 標準入力と標準エラーは端末のまま (パスフレーズを聞くため)。結果は標準出力だけを受け取る
			stdio: ['inherit', 'pipe', 'inherit'],
		});
	} catch (error) {
		// ssh 自体の失敗 (接続や認証) は 255 で終わる。VPS のコマンドの失敗は、そのコマンドの終了コードになる
		if (error instanceof Error && 'status' in error && error.status === 255) {
			console.error(
				'VPS に SSH で入れませんでした。パスワードでは接続せず、公開鍵だけで入ります。' +
					'.env.ssh の SSH_KEY に秘密鍵のパスを書くか、SSH_HOST に ~/.ssh/config の Host 名を書いてください。' +
					'原因を調べたいときは、ssh -v で同じ宛先に手で接続してみてください ' +
					'(毎回のパスフレーズを省きたいときは、先に ssh-add で ssh-agent に鍵を登録します)。',
			);
		}
		throw error;
	}
}

/**
 * Funmary を再起動し、動いているかを確かめる。1 回の接続で済ませる
 * @param {SshConfig} config
 * @returns {boolean} 動いていれば true
 */
export function restartFunmary(config) {
	console.log(`${config.host} の Funmary を再起動しています…`);
	let state;
	try {
		state = runSsh(config, [RESTART_COMMAND]).trim();
	} catch (error) {
		// 動いていなければ is-active は 0 以外で終わるので、状態は例外の標準出力から読む
		state =
			(error instanceof Error && 'stdout' in error ? String(error.stdout).trim() : '') || '不明';
	}
	return reportRestart(state);
}

/**
 * 再起動のあとの状態を伝える
 * @param {string | null} state
 * @returns {boolean} 動いていれば true
 */
export function reportRestart(state) {
	if (state === 'active') {
		console.log('再起動しました。Funmary は動いています。');
		return true;
	}
	console.error(
		`再起動のあとの状態が ${state ?? '不明'} です。VPS で journalctl -u funmary -n 50 を見て、原因を確かめてください。`,
	);
	return false;
}
