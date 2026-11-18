// 環境変数ファイル (.env や /etc/funmary/funmary.env) の中身を書き換える処理。ファイルは読み書きしない。
import { generateKeyPairSync } from 'node:crypto';
import { generateEncryptionKey, generateToken } from '@funmary/db';
import { align, diff, parse, prune, stringify, type EntryNode, type EnvDocument } from 'migenv';

/** funmary-admin init が作る鍵の名前 */
export const SECRET_NAMES = [
	'SESSION_SECRET',
	'ENCRYPTION_KEY',
	'VAPID_PUBLIC_KEY',
	'VAPID_PRIVATE_KEY',
] as const;

export type Secrets = Record<(typeof SECRET_NAMES)[number], string>;

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

function withRawValue(entry: EntryNode, rawValue: string): EntryNode {
	return {
		...entry,
		raw: entry.raw.slice(0, entry.raw.length - entry.rawValue.length) + rawValue,
		rawValue,
	};
}

function appendEnvLines(document: EnvDocument, lines: readonly string[]): string {
	const separator = document.nodes.length > 0 && !document.finalNewline ? document.newline : '';
	return stringify(document) + separator + lines.join(document.newline) + document.newline;
}

/**
 * 値が空の鍵だけを埋め、行のない鍵は末尾に足す。値のある行、ほかの行、コメント、並び順、改行の形は変えない。
 * 鍵を作り直すと暗号化したデータが読めなくなるので、埋まっている鍵には触れない。
 */
export function fillSecrets(text: string, generate: () => Secrets): FillResult {
	const document = parse(text);
	const secrets = generate();
	const filled: string[] = [];
	const seen = new Set<string>();

	const nodes = document.nodes.map((node) => {
		if (node.kind !== 'entry') return node;
		const name = SECRET_NAMES.find((secret) => secret === node.key);
		if (name === undefined) return node;
		seen.add(name);
		if (node.rawValue.trim() !== '') return node;
		filled.push(name);
		return withRawValue(node, secrets[name]);
	});

	const updated = { ...document, nodes };
	const missing = SECRET_NAMES.filter((name) => !seen.has(name));
	if (missing.length === 0) return { text: stringify(updated), filled };
	return {
		text: appendEnvLines(
			updated,
			missing.map((name) => `${name}=${secrets[name]}`),
		),
		filled: [...filled, ...missing],
	};
}

/**
 * ひな形の並びに合わせ、ひな形にない変数は末尾に残す。
 * 並べ替えで引用符の解釈が変わる場合は、呼び出し元での書き込みを止める。
 */
export function alignEnvFile(current: string, template: string) {
	const result = align(current, template, {
		rename: false,
		// 空に見える値でも、引用符やコメントが書かれていれば引き継ぐ
		protect: (_key, rawValue) => rawValue !== '',
		extrasHeader: '# ---- ほかの変数 (テンプレートにない。手で見直してください) ----',
	});
	if (result.warnings.some(({ code }) => code === 'ambiguous-quote')) {
		throw new Error(
			'並べ替えると環境変数の値の解釈が変わります。引用符の使い方を確認してください。',
		);
	}
	return result;
}

/** 引用符やコメントを含む値を取得する。同じ変数が複数あれば、最後に書かれた値を使う */
export function parseEnvValues(text: string): Map<string, string> {
	const values = new Map<string, string>();
	for (const node of parse(text).nodes) {
		if (node.kind === 'entry') values.set(node.key, node.rawValue);
	}
	return values;
}

/** ひな形で廃止を指定された変数のうち、ファイルに残っているものを返す */
export function findRetiredEnvKeys(current: string, template: string) {
	return diff(current, template).retired;
}

/** 指定した鍵の行を消す。コメント、ほかの行、改行の形は変えない */
export function removeEnvKeys(text: string, names: readonly string[]) {
	const { text: updated, removed } = prune(text, names);
	return { text: updated, removed };
}

/**
 * 指定した鍵の値だけを書き換える。コメント、並び順、改行の形は変えない。
 * 行のない鍵は、末尾に見出しを付けて足す (ふつうは先に alignEnvFile で行を用意するが、手元の .env にあって .env.example にまだない鍵を送るとき、黙って捨てないため)
 */
export function setEnvValues(text: string, overrides: ReadonlyMap<string, string>): string {
	const document = parse(text);
	const replaced = new Set<string>();
	const nodes = document.nodes.map((node) => {
		if (node.kind !== 'entry') return node;
		const rawValue = overrides.get(node.key);
		if (rawValue === undefined) return node;
		replaced.add(node.key);
		return withRawValue(node, rawValue);
	});
	// 行のない鍵は、黙って捨てずに末尾に足す (.env.example にまだない鍵を、手元の .env から送るとき)
	const missing = [...overrides].filter(([name]) => !replaced.has(name));
	const updated = { ...document, nodes };
	if (missing.length === 0) return stringify(updated);
	return appendEnvLines(updated, [
		'',
		'# .env.example にない鍵 (手元の .env から足した)',
		...missing.map(([name, value]) => `${name}=${value}`),
	]);
}
