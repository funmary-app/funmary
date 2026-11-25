// 環境変数ファイル (.env や /etc/funmary/funmary.env) の中身を書き換える処理。ファイルは読み書きしない。
import { generateKeyPairSync } from 'node:crypto';
import { generateEncryptionKey, generateToken } from '@funmary/db';
import { align, diff, parse, prune, setValues, type SetResult } from 'migenv';

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

function assertNoAmbiguousQuote(result: SetResult): void {
	if (result.warnings.some(({ code }) => code === 'ambiguous-quote')) {
		throw new Error(
			'書き換えると環境変数の値の解釈が変わります。引用符の使い方を確認してください。',
		);
	}
}

/** 書き換えを見送った鍵があれば、黙って一部だけ書いたファイルを残さないよう止める */
function assertAllSet(result: SetResult): void {
	assertNoAmbiguousQuote(result);
	if (result.skipped.length > 0) {
		throw new Error(`次の鍵を書き換えられませんでした: ${result.skipped.join(', ')}`);
	}
}

function appendEnvLines(text: string, lines: readonly string[]): string {
	const { nodes, newline, finalNewline } = parse(text);
	const separator = nodes.length > 0 && !finalNewline ? newline : '';
	return text + separator + lines.join(newline) + newline;
}

/**
 * 値が空の鍵だけを埋め、行のない鍵は末尾に足す。値のある行、ほかの行、コメント、並び順、改行の形は変えない。
 * 鍵を作り直すと暗号化したデータが読めなくなるので、埋まっている鍵には触れない。
 */
export function fillSecrets(text: string, generate: () => Secrets): FillResult {
	const alreadySet = new Set<string>();
	for (const node of parse(text).nodes) {
		if (node.kind === 'entry' && node.rawValue.trim() !== '') alreadySet.add(node.key);
	}
	const secrets = generate();
	const targets = new Map(
		SECRET_NAMES.filter((name) => !alreadySet.has(name)).map((name) => [name, secrets[name]]),
	);
	if (targets.size === 0) return { text, filled: [] };
	const result = setValues(text, targets);
	assertAllSet(result);
	return { text: result.text, filled: [...result.updated, ...result.added] };
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
	const existing = setValues(text, overrides, { add: false });
	assertNoAmbiguousQuote(existing);
	const updated = new Set(existing.updated);
	const missing = new Map([...overrides].filter(([name]) => !updated.has(name)));
	if (missing.size === 0) return existing.text;
	const withHeading = appendEnvLines(existing.text, [
		'',
		'# .env.example にない鍵 (手元の .env から足した)',
	]);
	const appended = setValues(withHeading, missing);
	assertAllSet(appended);
	return appended.text;
}
