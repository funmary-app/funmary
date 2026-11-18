// リリースの JavaScript が、ビルドの外から読み込んでいるパッケージを調べる (package-release.js が使う)。
// VPS には better-sqlite3 しか入れないので、ほかのパッケージを読み込んでいると、本番でその画面が動かない。
// コメントや文字列の中の import を拾わないよう、es-module-lexer で読む
import { builtinModules } from 'node:module';
import { init, parse } from 'es-module-lexer';

await init();

/**
 * コードが読み込むパッケージの名前 (と、その下のパス)。相対パス、Node.js の組み込み、文字列で決まらない動的な import (import(url) など) は除く
 * @param {string} code
 * @returns {string[]}
 */
export function externalImports(code) {
	const [imports] = parse(code);
	return imports.flatMap((entry) => {
		// import.meta には specifier がない。テンプレート文字列の動的な import は、決まらないので除く
		const specifier = 'specifier' in entry ? entry.specifier : undefined;
		if (specifier == null || ('glob' in entry && entry.glob)) return [];
		if (/^(\.|\/|node:|data:|file:)/.test(specifier)) return [];
		if (builtinModules.includes(specifier)) return [];
		return [specifier];
	});
}
