// 環境変数ファイル (.env や /etc/funmary/funmary.env) の中身を書き換える処理。ファイルは読み書きしない。
import { generateKeyPairSync } from 'node:crypto';
import { generateEncryptionKey, generateToken } from '@funmary/db';

/** funmary-admin init が作る鍵の名前 */
export const SECRET_NAMES = [
	'SESSION_SECRET',
	'ENCRYPTION_KEY',
	'VAPID_PUBLIC_KEY',
	'VAPID_PRIVATE_KEY',
] as const;

export type Secrets = Record<(typeof SECRET_NAMES)[number], string>;

/** 使わなくなった鍵。pnpm env:upload が、本番の環境変数ファイルから消すか聞く */
export const RETIRED_NAMES = [
	// 登録の方式は、管理画面の「登録と招待」で変えるようにした
	'REGISTRATION',
	// 招待コードを発行できる人と月の上限は、管理画面の「登録と招待」で決める
	'INVITES_PER_USER',
] as const;

/** funmary-admin init が埋める鍵を、新しく作る */
export function generateSecrets(): Secrets {
	// プッシュ通知の VAPID の鍵は P-256 (Web Push の決まり)。公開鍵は非圧縮の点 (0x04 と x と y)
	const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
	const { x, y } = publicKey.export({ format: 'jwk' });
	const { d } = privateKey.export({ format: 'jwk' });
	if (x === undefined || y === undefined || d === undefined) {
		throw new Error('VAPID の鍵を作れませんでした');
	}
	const point = Buffer.concat([
		Buffer.from([0x04]),
		Buffer.from(x, 'base64url'),
		Buffer.from(y, 'base64url'),
	]);
	return {
		SESSION_SECRET: generateToken(),
		ENCRYPTION_KEY: generateEncryptionKey(),
		VAPID_PUBLIC_KEY: point.toString('base64url'),
		VAPID_PRIVATE_KEY: d,
	};
}

export interface FillResult {
	readonly text: string;
	/** 新しく埋めた鍵の名前 */
	readonly filled: readonly string[];
}

/**
 * 値が空の鍵だけを埋め、行のない鍵は末尾に足す。値のある行、ほかの行、コメント、並び順、改行の形は変えない。
 * 鍵を作り直すと暗号化したデータが読めなくなるので、埋まっている鍵には触れない。
 */
export function fillSecrets(text: string, generate: () => Secrets): FillResult {
	const newline = text.includes('\r\n') ? '\r\n' : '\n';
	const lines = text.split(newline);
	const secrets = generate();
	const filled: string[] = [];
	const seen = new Set<string>();

	const replaced = lines.map((line) => {
		const match = /^([A-Z_]+)\s*=(.*)$/.exec(line);
		const name = SECRET_NAMES.find((secret) => secret === match?.[1]);
		if (name === undefined) return line;
		seen.add(name);
		if (match?.[2]?.trim() !== '') return line;
		filled.push(name);
		return `${name}=${secrets[name]}`;
	});

	const missing = SECRET_NAMES.filter((name) => !seen.has(name));
	if (missing.length > 0) {
		// 末尾の改行の後ろに足す。最後の要素が空文字列なら、ファイルは改行で終わっている
		if (replaced.at(-1) === '') replaced.pop();
		for (const name of missing) {
			replaced.push(`${name}=${secrets[name]}`);
			filled.push(name);
		}
		replaced.push('');
	}
	return { text: replaced.join(newline), filled };
}

const ENV_LINE = /^([A-Z_]+)\s*=(.*)$/;

export interface AlignResult {
	readonly text: string;
	/** template にはあるが、current になかった鍵 (空のまま足した) */
	readonly added: readonly string[];
	/** current にはあるが、template にない鍵 (値を保ち、末尾にまとめて残した) */
	readonly extra: readonly string[];
}

/**
 * current の並びを、template (.env.example) の並びに合わせる。値のある行の値は変えない。
 * template にあって current にない鍵は、template の位置に空のまま足す。
 * current にあって template にない鍵は、値を保ったまま末尾にまとめる (消さない)。
 * コメントと見出し、空行、改行の形は template のものを使う。
 */
export function alignEnvFile(current: string, template: string): AlignResult {
	const newline = template.includes('\r\n') ? '\r\n' : '\n';
	const currentLines = current.split(/\r\n|\n/);

	// 同じ鍵が 2 回あれば、あとの行を使う (env_value と同じ考え方)
	const values = new Map<string, string>();
	for (const line of currentLines) {
		const match = ENV_LINE.exec(line);
		if (match?.[1]) values.set(match[1], match[2] ?? '');
	}

	const added: string[] = [];
	const templateKeys = new Set<string>();
	const aligned = template.split(/\r\n|\n/).map((line) => {
		const match = ENV_LINE.exec(line);
		if (!match?.[1]) return line;
		const name = match[1];
		templateKeys.add(name);
		if (!values.has(name)) {
			added.push(name);
			return line;
		}
		const value = values.get(name);
		if (value === '' || value === undefined) return line;
		return `${name}=${value}`;
	});

	const extraKeys = [...values.keys()].filter((name) => !templateKeys.has(name));
	if (extraKeys.length > 0) {
		if (aligned.at(-1) === '') aligned.pop();
		aligned.push('', '# ---- ほかの変数 (テンプレートにない。手で見直してください) ----', '');
		for (const name of extraKeys) aligned.push(`${name}=${values.get(name) ?? ''}`);
		aligned.push('');
	}
	return { text: aligned.join(newline), added, extra: extraKeys };
}

/** `KEY=値` の行を、鍵の名前と値の入れ物にする。同じ鍵が 2 回あれば、あとの行を使う */
export function parseEnvValues(text: string): Map<string, string> {
	const values = new Map<string, string>();
	for (const line of text.split(/\r\n|\n/)) {
		const match = ENV_LINE.exec(line);
		if (match?.[1]) values.set(match[1], match[2] ?? '');
	}
	return values;
}

/** 指定した鍵の行を消す。コメント、ほかの行、改行の形は変えない */
export function removeEnvKeys(
	text: string,
	names: readonly string[],
): { text: string; removed: string[] } {
	const newline = text.includes('\r\n') ? '\r\n' : '\n';
	const removed = new Set<string>();
	const lines = text.split(/\r\n|\n/).filter((line) => {
		const name = ENV_LINE.exec(line)?.[1];
		if (!name || !names.includes(name)) return true;
		removed.add(name);
		return false;
	});
	return { text: lines.join(newline), removed: [...removed] };
}

/**
 * 指定した鍵の値だけを書き換える。コメント、並び順、改行の形は変えない。
 * 行のない鍵は、末尾に見出しを付けて足す (ふつうは先に alignEnvFile で行を用意するが、
 * 手元の .env にあって .env.example にまだない鍵を送るとき、黙って捨てないため)
 */
export function setEnvValues(text: string, overrides: ReadonlyMap<string, string>): string {
	const newline = text.includes('\r\n') ? '\r\n' : '\n';
	const replaced = new Set<string>();
	const lines = text.split(/\r\n|\n/).map((line) => {
		const match = ENV_LINE.exec(line);
		const name = match?.[1];
		if (!name || !overrides.has(name)) return line;
		replaced.add(name);
		return `${name}=${overrides.get(name)}`;
	});
	// 行のない鍵は、黙って捨てずに末尾に足す (.env.example にまだない鍵を、手元の .env から送るとき)
	const missing = [...overrides].filter(([name]) => !replaced.has(name));
	if (missing.length === 0) return lines.join(newline);
	if (lines.at(-1) === '') lines.pop();
	return [
		...lines,
		'',
		'# .env.example にない鍵 (手元の .env から足した)',
		...missing.map(([name, value]) => `${name}=${value}`),
		'',
	].join(newline);
}
