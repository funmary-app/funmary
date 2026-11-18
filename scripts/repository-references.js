// Markdown、シェル、YAML に直接書いたリポジトリ名が repository.json と一致するか、テストで確認する。

// GitHub のホスト名の直後、シェルの既定値 (${VAR:-...}) の中、パスや名前の途中でない位置にある、funmary と funmary-mirror の owner/repo を拾う
const REFERENCE =
	/(?:(?<=github(?:usercontent)?\.com[/:])|(?<=:-)|(?<![\w./@$-]))([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/funmary(?:-mirror)?)(?![\w-])/g;

/**
 * @param {string} text
 * @returns {string[]} 見つかった順の owner/repo
 */
export function findRepositoryReferences(text) {
	return Array.from(text.matchAll(REFERENCE), (match) => match[1] ?? '');
}
