// SMUI の部品ごとの CSS を、部品を使うページだけで読ませる。
// scripts/build-theme.js が部品ごとの CSS を作り、vite.config.js の smuiStyles が、
// `@smui/<部品>` を import したモジュールの先頭に、その部品の CSS の import を足す。
// CSS は Vite がページごとのチャンクに分けるので、部品を使わないページでは読まれない。
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * 部品の CSS の置き場所 (apps/web から見たパス)
 * @param {string} name `@smui/textfield` や `@smui-extra/accordion` のようなパッケージ名
 */
export function smuiStyleFile(name) {
	const file = name.replace(/^@smui\//, '').replace(/^@smui-extra\//, 'extra-');
	return `src/lib/styles/generated/smui/${file}.css`;
}

/** SMUI の部品を import している文から、パッケージ名を取り出す (`@smui/textfield/helper-text` も `@smui/textfield`) */
const SMUI_IMPORT = /\bfrom\s*["'](@smui(?:-extra)?\/[a-z0-9-]+)(?:\/[^"']*)?["']/g;

/**
 * 部品の CSS を、build-theme.js が作ったか (スタイルのない部品の分は作らない)
 * @param {string} name
 */
const styleExists = (name) =>
	existsSync(new URL(smuiStyleFile(name), `file:///${webRoot.replaceAll('\\', '/')}/`));

/**
 * 変換したモジュールのコードに、使っている SMUI の部品の CSS の import を足す
 * @param {string} code
 * @param {(name: string) => boolean} [hasStyle] 部品の CSS があるか
 * @returns {string | undefined} 足すものがなければ undefined
 */
export function withSmuiStyles(code, hasStyle = styleExists) {
	const names = new Set([...code.matchAll(SMUI_IMPORT)].map((match) => match[1] ?? ''));
	const imports = [...names]
		.filter((name) => hasStyle(name))
		.map((name) => `import '${smuiStyleFile(name).replace(/^src\/lib\//, '#lib/')}';`);
	return imports.length > 0 ? `${imports.join('\n')}\n${code}` : undefined;
}

/**
 * Vite のプラグイン。Svelte を JavaScript にしたあと (と .ts) のコードを見る
 * @returns {import('vite').Plugin}
 */
export function smuiStyles() {
	return {
		name: 'funmary-smui-styles',
		transform(code, id) {
			// node_modules の中 (SMUI 自身) と、CSS などの仮想モジュール (?svelte&type=style) は見ない
			if (id.includes('/node_modules/') || id.includes('?') || !/\.(svelte|ts|js)$/.test(id))
				return;
			const transformed = withSmuiStyles(code);
			return transformed === undefined ? undefined : { code: transformed, map: null };
		},
	};
}
