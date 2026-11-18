// SSH で VPS に反映を頼む (deploy.yml)。VPS では funmary-update が版の名前を確かめ、update.sh が反映する。
// 環境変数: RELEASED_SHA_FILE (Release が残した、リリースにしたコミットの hash のファイル)、DEPLOY_HOST、DEPLOY_SSH_KEY、DEPLOY_KNOWN_HOSTS (Environment production の secret)、DEPLOY_ENABLED (false なら反映しない)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { releaseVersion } from '../release/release-version.js';

/**
 * DEPLOY_ENABLED が false のときだけ止める。止めたいときは明示する
 * @param {string | undefined} value
 * @returns {boolean}
 */
export function isDeployEnabled(value) {
	return value !== 'false';
}

/**
 * Release が残した released-sha の中身を読む。
 * workflow_run で起動した Deploy の head_sha は、起動した時点の main の最新のコミットで、Release が作った版と違うことがある
 * (続けてマージすると、まだ作られていない版を頼んで 404 になる)。そのため、版は Release から受け取る
 * @param {string} text
 * @returns {string}
 */
export function parseReleasedSha(text) {
	const sha = text.trim();
	if (!/^[0-9a-f]{40}$/.test(sha)) {
		throw new Error(
			`Release の成果物 released-sha を、コミットの hash として読めません: ${JSON.stringify(sha)}`,
		);
	}
	return sha;
}

/**
 * @param {string} name
 * @returns {string}
 */
function requiredEnv(name) {
	const value = process.env[name];
	if (!value)
		throw new Error(
			`環境変数 ${name} がありません (Environment production の secret を確かめてください)`,
		);
	return value;
}

if (import.meta.main) {
	if (!isDeployEnabled(process.env['DEPLOY_ENABLED'])) {
		console.log('DEPLOY_ENABLED が false なので、反映しません');
	} else {
		const version = releaseVersion(
			parseReleasedSha(readFileSync(requiredEnv('RELEASED_SHA_FILE'), 'utf8')),
		);
		const host = requiredEnv('DEPLOY_HOST');
		const sshDir = join(homedir(), '.ssh');
		const keyFile = join(sshDir, 'deploy_key');
		mkdirSync(sshDir, { recursive: true, mode: 0o700 });
		writeFileSync(keyFile, `${requiredEnv('DEPLOY_SSH_KEY')}\n`, { mode: 0o600 });
		// ホストの公開鍵を固定する。接続先がすり替わっていれば、接続しない
		writeFileSync(join(sshDir, 'known_hosts'), `${requiredEnv('DEPLOY_KNOWN_HOSTS')}\n`);
		try {
			// この鍵で入ると、VPS 側が決めたコマンドだけが動く。ここで渡す版の名前は、VPS 側でも形を確かめる
			execFileSync(
				'ssh',
				[
					'-i',
					keyFile,
					'-o',
					'IdentitiesOnly=yes',
					'-o',
					'BatchMode=yes',
					'-o',
					'StrictHostKeyChecking=yes',
					`funmary-deploy@${host}`,
					version,
				],
				{ stdio: 'inherit' },
			);
		} catch (error) {
			console.error(
				'VPS への反映に失敗しました。次を確かめてください: (1) VPS に /usr/local/sbin/funmary-update があるか (最初の配置がまだだと、sudo: command not found になる)、' +
					'(2) funmary-deploy の authorized_keys の command= と sudoers の設定、(3) DEPLOY_KNOWN_HOSTS が VPS のホストの公開鍵と合っているか',
			);
			throw error;
		} finally {
			rmSync(keyFile, { force: true });
		}
	}
}
