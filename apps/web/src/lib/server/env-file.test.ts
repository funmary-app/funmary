import { describe, expect, it } from 'vitest';
import { parseConfig } from './config.ts';
import {
	alignEnvFile,
	fillSecrets,
	findRetiredEnvKeys,
	generateSecrets,
	parseEnvValues,
	removeEnvKeys,
	setEnvValues,
} from './env-file.ts';

/** 毎回同じ値を返す、テスト用の鍵の作り方 */
const fixedSecrets = () => ({
	SESSION_SECRET: 'session',
	ENCRYPTION_KEY: 'encryption',
	VAPID_PUBLIC_KEY: 'public',
	VAPID_PRIVATE_KEY: 'private',
});

describe('fillSecrets', () => {
	it('空の鍵だけを埋め、ほかの行とコメントはそのまま残す', () => {
		const text = [
			'# 鍵',
			'SESSION_SECRET=',
			'ENCRYPTION_KEY=already-set',
			'VAPID_PUBLIC_KEY=',
			'VAPID_PRIVATE_KEY=',
			'',
			'# Google',
			'GOOGLE_CLIENT_ID=client-id',
			'',
		].join('\n');

		const result = fillSecrets(text, fixedSecrets);

		expect(result.text).toBe(
			[
				'# 鍵',
				'SESSION_SECRET=session',
				'ENCRYPTION_KEY=already-set',
				'VAPID_PUBLIC_KEY=public',
				'VAPID_PRIVATE_KEY=private',
				'',
				'# Google',
				'GOOGLE_CLIENT_ID=client-id',
				'',
			].join('\n'),
		);
		expect(result.filled).toEqual(['SESSION_SECRET', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']);
	});

	it('行のない鍵は末尾に足し、2 回目は何も変えない', () => {
		const first = fillSecrets('GOOGLE_CLIENT_ID=client-id\n', fixedSecrets);
		expect(first.text).toBe(
			[
				'GOOGLE_CLIENT_ID=client-id',
				'SESSION_SECRET=session',
				'ENCRYPTION_KEY=encryption',
				'VAPID_PUBLIC_KEY=public',
				'VAPID_PRIVATE_KEY=private',
				'',
			].join('\n'),
		);

		const second = fillSecrets(first.text, () => ({
			SESSION_SECRET: 'other',
			ENCRYPTION_KEY: 'other',
			VAPID_PUBLIC_KEY: 'other',
			VAPID_PRIVATE_KEY: 'other',
		}));
		expect(second).toEqual({ text: first.text, filled: [] });
	});

	it('Windows の改行 (CRLF) を保ち、空白だけの値も空として埋める', () => {
		const text =
			'SESSION_SECRET= \r\nENCRYPTION_KEY=\r\nVAPID_PUBLIC_KEY=x\r\nVAPID_PRIVATE_KEY=y\r\n';
		expect(fillSecrets(text, fixedSecrets)).toEqual({
			text: 'SESSION_SECRET=session\r\nENCRYPTION_KEY=encryption\r\nVAPID_PUBLIC_KEY=x\r\nVAPID_PRIVATE_KEY=y\r\n',
			filled: ['SESSION_SECRET', 'ENCRYPTION_KEY'],
		});
	});

	it('複数行の値に含まれる鍵名と区別して、ファイルにない鍵を末尾に追加する', () => {
		const text = '# 鍵\nPROFILE="1 行目\nSESSION_SECRET=\n3 行目"\n';

		expect(fillSecrets(text, fixedSecrets)).toEqual({
			text:
				text +
				'SESSION_SECRET=session\nENCRYPTION_KEY=encryption\nVAPID_PUBLIC_KEY=public\nVAPID_PRIVATE_KEY=private\n',
			filled: ['SESSION_SECRET', 'ENCRYPTION_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'],
		});
	});
});

describe('alignEnvFile', () => {
	const template = [
		'# ---- サーバー ----',
		'',
		'ORIGIN=',
		'HOST=',
		'',
		'# ---- 通知 ----',
		'',
		'DISCORD_BOT_TOKEN=',
		'DISCORD_CLIENT_ID=',
		'',
	].join('\n');

	it('template の並びに合わせ、値のある行の値は保つ', () => {
		const current = ['HOST=127.0.0.1', 'ORIGIN=https://funmary.example.com', ''].join('\n');
		const result = alignEnvFile(current, template);
		expect(result.text).toBe(
			[
				'# ---- サーバー ----',
				'',
				'ORIGIN=https://funmary.example.com',
				'HOST=127.0.0.1',
				'',
				'# ---- 通知 ----',
				'',
				'DISCORD_BOT_TOKEN=',
				'DISCORD_CLIENT_ID=',
				'',
			].join('\n'),
		);
	});

	it('template にあって current にない鍵は、template の位置に空のまま足す', () => {
		const current = 'ORIGIN=https://funmary.example.com\n';
		const result = alignEnvFile(current, template);
		expect(result.added).toEqual(['HOST', 'DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_ID']);
		expect(result.text).toContain('DISCORD_CLIENT_ID=\n');
	});

	it('current にあって template にない鍵は、値を保ったまま末尾にまとめる (消さない)', () => {
		const current = ['ORIGIN=https://funmary.example.com', 'OLD_KEY=keep-me', ''].join('\n');
		const result = alignEnvFile(current, template);
		expect(result.extra).toEqual(['OLD_KEY']);
		expect(result.text).toContain('OLD_KEY=keep-me');
		expect(result.text).toContain('ほかの変数');
	});

	it('変える必要がなければ、template と同じ形のまま返す', () => {
		const current = template;
		const result = alignEnvFile(current, template);
		expect(result.text).toBe(template);
		expect(result.added).toEqual([]);
		expect(result.extra).toEqual([]);
	});

	it('Windows の改行 (CRLF) は template に合わせる', () => {
		const crlfTemplate = template.replaceAll('\n', '\r\n');
		const current = 'ORIGIN=https://funmary.example.com\n';
		const result = alignEnvFile(current, crlfTemplate);
		expect(result.text).toContain('\r\n');
		expect(result.text).not.toMatch(/[^\r]\n/);
	});

	it('複数行の値をそのまま移し、値の中にある行を別の鍵として扱わない', () => {
		const current = 'PORT=3000\nPROFILE="1 行目\nHOST=example\n3 行目" # 説明\n';
		const template = '# 設定\nPROFILE=\nHOST=\nPORT=\n';

		expect(alignEnvFile(current, template)).toMatchObject({
			text: '# 設定\nPROFILE="1 行目\nHOST=example\n3 行目" # 説明\nHOST=\nPORT=3000\n',
			added: ['HOST'],
			extra: [],
		});
	});
});

describe('parseEnvValues', () => {
	it('KEY=値 の行を読み、コメントと空行は無視する', () => {
		const text = ['# コメント', 'ORIGIN=https://funmary.example.com', '', 'HOST='].join('\n');
		expect(parseEnvValues(text)).toEqual(
			new Map([
				['ORIGIN', 'https://funmary.example.com'],
				['HOST', ''],
			]),
		);
	});

	it('同じ鍵が 2 回あれば、あとの行の値を使う', () => {
		const text = ['ORIGIN=first', 'ORIGIN=second'].join('\n');
		expect(parseEnvValues(text).get('ORIGIN')).toBe('second');
	});

	it('引用符とコメントを含む複数行の値をまとめて読み取る', () => {
		expect(parseEnvValues('PROFILE="1 行目\nROLE=member\n3 行目" # 説明\nROLE=owner\n')).toEqual(
			new Map([
				['PROFILE', '"1 行目\nROLE=member\n3 行目" # 説明'],
				['ROLE', 'owner'],
			]),
		);
	});
});

describe('setEnvValues', () => {
	it('指定した鍵の値だけを書き換える', () => {
		const text = ['ORIGIN=old', 'HOST=127.0.0.1', ''].join('\n');
		const result = setEnvValues(text, new Map([['ORIGIN', 'new']]));
		expect(result).toBe(['ORIGIN=new', 'HOST=127.0.0.1', ''].join('\n'));
	});

	it('行のない鍵は、黙って捨てずに末尾に足す (.env.example にまだない鍵を、手元から送るとき)', () => {
		const added = ['', '# .env.example にない鍵 (手元の .env から足した)', 'NEW_KEY=x', ''];
		expect(setEnvValues('ORIGIN=old\n', new Map([['NEW_KEY', 'x']]))).toBe(
			['ORIGIN=old', ...added].join('\n'),
		);
		// 末尾に改行がないファイルでも、行をつなげずに足す
		expect(setEnvValues('ORIGIN=old', new Map([['NEW_KEY', 'x']]))).toBe(
			['ORIGIN=old', ...added].join('\n'),
		);
	});

	it('Windows の改行 (CRLF) を保つ', () => {
		const text = 'ORIGIN=old\r\nHOST=127.0.0.1\r\n';
		const result = setEnvValues(text, new Map([['ORIGIN', 'new']]));
		expect(result).toBe('ORIGIN=new\r\nHOST=127.0.0.1\r\n');
	});

	it('引用符で囲まれた複数行の値全体を置き換え、ほかの鍵と混在する改行を保つ', () => {
		const text = 'PROFILE="old\r\nROLE=example\r\nend"\r\nROLE=owner\n';

		expect(setEnvValues(text, new Map([['PROFILE', '"new\nsecond"']]))).toBe(
			'PROFILE="new\nsecond"\r\nROLE=owner\n',
		);
	});
});

describe('removeEnvKeys', () => {
	it('ひな形で廃止を指定した変数のうち、現在のファイルに残っているものを選ぶ', () => {
		const template = '# @retired OLD_FORMAT REMOVED\nKEEP=\n';
		const current = 'KEEP=yes\nOLD_FORMAT=default\nOTHER=enabled\n';

		expect(findRetiredEnvKeys(current, template)).toEqual(['OLD_FORMAT']);
	});

	it('指定した鍵の行だけを消し、ほかの行とコメントは残して、消した鍵を返す', () => {
		const text = ['# 登録', 'REGISTRATION=open', 'ADMIN_EMAILS=a@fun.ac.jp', ''].join('\n');
		expect(removeEnvKeys(text, ['REGISTRATION', 'NOT_THERE'])).toEqual({
			text: ['# 登録', 'ADMIN_EMAILS=a@fun.ac.jp', ''].join('\n'),
			removed: ['REGISTRATION'],
		});
	});

	it('改行の形 (CRLF) を保つ', () => {
		const text = 'REGISTRATION=\r\nHOST=127.0.0.1\r\n';
		expect(removeEnvKeys(text, ['REGISTRATION']).text).toBe('HOST=127.0.0.1\r\n');
	});

	it('廃止した鍵の行だけを消し、複数行の値の中にある同名の行は残す', () => {
		const text = '\uFEFFPROFILE="1 行目\r\nREGISTRATION=example\n3 行目"\nREGISTRATION=open\r\n';

		expect(removeEnvKeys(text, ['REGISTRATION'])).toEqual({
			text: '\uFEFFPROFILE="1 行目\r\nREGISTRATION=example\n3 行目"\n',
			removed: ['REGISTRATION'],
		});
	});
});

describe('generateSecrets', () => {
	it('作った鍵は、起動時の設定の検査に通る', () => {
		const result = parseConfig({
			...generateSecrets(),
			VAPID_SUBJECT: 'mailto:admin@funmary.example.com',
			GOOGLE_CLIENT_ID: '1234567890-abc.apps.googleusercontent.com',
			GOOGLE_CLIENT_SECRET: 'GOCSPX-example',
		});
		expect(result.ok ? [] : result.issues).toEqual([]);
	});

	it('VAPID の公開鍵は P-256 の非圧縮の形 (65 バイト、先頭が 0x04)、秘密鍵は 32 バイトにする', () => {
		const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = generateSecrets();
		const publicKey = Buffer.from(VAPID_PUBLIC_KEY, 'base64url');
		expect(publicKey).toHaveLength(65);
		expect(publicKey[0]).toBe(0x04);
		expect(Buffer.from(VAPID_PRIVATE_KEY, 'base64url')).toHaveLength(32);
	});

	it('毎回違う鍵を作る', () => {
		const first = generateSecrets();
		const second = generateSecrets();
		for (const name of Object.keys(first) as (keyof typeof first)[]) {
			expect(second[name]).not.toBe(first[name]);
		}
	});
});
