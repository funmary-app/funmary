import { describe, expect, it } from 'vitest';
import {
	RESTART_COMMAND,
	parseWriteResult,
	resolveSshBin,
	shellQuote,
	sshArgs,
	writeFileCommand,
} from './vps-ssh.js';

describe('sshArgs', () => {
	it('パスフレーズを聞けるよう、BatchMode は付けない', () => {
		expect(sshArgs({ host: 'root@funmary.example.com' }, ['true'])).toEqual([
			'-o',
			'PreferredAuthentications=publickey',
			'root@funmary.example.com',
			'true',
		]);
	});

	it('鍵を指定しなくても、公開鍵認証だけを使う', () => {
		const args = sshArgs({ host: 'funmary-vps' }, ['true']);
		expect(args[args.indexOf('PreferredAuthentications=publickey') - 1]).toBe('-o');
	});

	it('ポートと鍵を書いていれば渡し、鍵はその鍵だけを使う', () => {
		expect(
			sshArgs({ host: 'root@funmary.example.com', port: '2222', key: 'C:/keys/vps' }, ['true']),
		).toEqual([
			'-o',
			'PreferredAuthentications=publickey',
			'-o',
			'IdentitiesOnly=yes',
			'-p',
			'2222',
			'-i',
			'C:/keys/vps',
			'root@funmary.example.com',
			'true',
		]);
	});
});

describe('resolveSshBin', () => {
	const windowsOpenSsh = 'C:\\Windows\\System32\\OpenSSH\\ssh.exe';

	it('SSH_BIN を書いていれば、それを使う', () => {
		expect(
			resolveSshBin({ sshBin: 'C:/tools/ssh.exe', platform: 'win32', exists: () => true }),
		).toBe('C:/tools/ssh.exe');
	});

	it('Windows では、Windows の OpenSSH があればそれを使う (Git for Windows の ssh より優先する)', () => {
		expect(resolveSshBin({ platform: 'win32', exists: (path) => path === windowsOpenSsh })).toBe(
			windowsOpenSsh,
		);
		expect(resolveSshBin({ platform: 'win32', exists: () => false })).toBe('ssh');
	});

	it('Windows でなければ、PATH の ssh を使う', () => {
		expect(resolveSshBin({ platform: 'linux', exists: () => true })).toBe('ssh');
	});
});

describe('writeFileCommand と parseWriteResult', () => {
	const content = "KEY=値 'quote' $HOME\n";

	it('中身を Base64 にしてコマンドに含め、控えてから書き換える (標準入力には流さない)', () => {
		const command = writeFileCommand({
			file: '/etc/funmary/funmary.env',
			backup: '/etc/funmary/funmary.env.bak.1',
			content,
			restart: false,
		});
		const base64 = Buffer.from(content, 'utf8').toString('base64');
		expect(command).toContain(
			`printf %s '${base64}' | base64 -d | sudo tee '/etc/funmary/funmary.env'`,
		);
		expect(command.indexOf('sudo cp -p')).toBeLessThan(command.indexOf('sudo tee'));
		expect(command).not.toContain('systemctl');
	});

	it('再起動を頼むと、書き換えのあとに同じ接続で再起動する', () => {
		const command = writeFileCommand({
			file: '/etc/funmary/funmary.env',
			backup: '/etc/funmary/funmary.env.bak.1',
			content,
			restart: true,
		});
		expect(command.endsWith(`{ ${RESTART_COMMAND}; }`)).toBe(true);
	});

	it('出力から、書き換えが済んだかと、再起動のあとの状態を読む', () => {
		expect(parseWriteResult('__funmary_written__\nactive\n')).toEqual({
			written: true,
			state: 'active',
		});
		expect(parseWriteResult('__funmary_written__\r\n')).toEqual({ written: true, state: null });
		expect(parseWriteResult('')).toEqual({ written: false, state: null });
	});
});

describe('shellQuote', () => {
	it("値を ' で囲み、中の ' は閉じてから入れ直す", () => {
		expect(shellQuote('/etc/funmary/funmary.env')).toBe("'/etc/funmary/funmary.env'");
		expect(shellQuote("it's")).toBe(String.raw`'it'\''s'`);
	});
});
