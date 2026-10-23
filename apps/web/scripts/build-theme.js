// SMUI のテーマ (src/theme) と、入れてある SMUI の部品のスタイルを CSS に変換する。
// - generated/smui.css: 色の CSS 変数とダーク用だけ。どのページでも読む
// - generated/smui/<部品>.css: 部品ごとのスタイル。その部品を import したモジュールに、vite.config.js の
//   smuiStyles が読み込みを足すので、部品を使うページだけで読まれる (全部のページで全部の部品の CSS を読まない)
// ダーク用は色の CSS 変数だけで、端末の設定がダークのときだけ効くよう @media で囲んで後ろに足す。
// smui-theme の compile は、pnpm の置き方では入れた部品のスタイルを見つけられないので使わず、Sass を直接呼ぶ。
// pnpm dev と pnpm build の前に動かす。部品を足したら、ここで作り直される。
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sass from 'sass';
import { smuiStyleFile } from './smui-styles.js';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const generated = join(webRoot, 'src/lib/styles/generated');
const output = join(generated, 'smui.css');

/** @type {unknown} */
const manifest = JSON.parse(readFileSync(join(webRoot, 'package.json'), 'utf8'));
/** @param {string} key */
const dependencyNames = (key) => {
	const dependencies =
		typeof manifest === 'object' && manifest !== null && key in manifest
			? /** @type {Record<string, unknown>} */ (manifest)[key]
			: undefined;
	return typeof dependencies === 'object' && dependencies !== null ? Object.keys(dependencies) : [];
};
const smuiPackages = [...dependencyNames('dependencies'), ...dependencyNames('devDependencies')]
	.filter((name) => name.startsWith('@smui/') || name.startsWith('@smui-extra/'))
	.sort();

/**
 * pnpm は、各パッケージの依存を、そのパッケージの実体の隣 (.pnpm/<名前>/node_modules) に置く。その場所を返す
 * @param {string} dir
 */
const storeOf = (dir) => dirname(dirname(realpathSync(dir)));
/**
 * 部品のスタイルは、依存する部品のスタイルを読む (@smui/data-table が @smui/select を読み、@smui/select が
 * @smui/menu-surface を読む)。依存の依存は、依存の実体の隣にしかないので、依存をたどって置き場所を集める
 * @param {string} dir パッケージの場所
 * @param {Set<string>} found 集めた置き場所
 */
const collectStores = (dir, found) => {
	const store = storeOf(dir);
	if (found.has(store)) return;
	found.add(store);
	/** @type {unknown} */
	const pkg = JSON.parse(readFileSync(join(realpathSync(dir), 'package.json'), 'utf8'));
	const dependencies =
		typeof pkg === 'object' && pkg !== null && 'dependencies' in pkg ? pkg.dependencies : undefined;
	const names =
		typeof dependencies === 'object' && dependencies !== null ? Object.keys(dependencies) : [];
	for (const name of names) {
		if (name.startsWith('@smui/') || name.startsWith('@smui-extra/'))
			collectStores(join(store, name), found);
	}
};
/** @type {Set<string>} */
const found = new Set();
for (const name of smuiPackages) collectStores(join(webRoot, 'node_modules', name), found);
const stores = [...found];
// @smui/common は部品の依存で、apps/web からは直接見えない。どの部品からも同じ @smui/common を読むよう、先頭に置く
// (テーマの設定 (with) は、同じ場所から読んだモジュールにだけ効くため)
const commonStore = storeOf(join(stores[0] ?? '', '@smui/common'));
const loadPaths = [commonStore, ...stores];

/**
 * @param {string} theme src/theme から見たテーマのファイル
 * @param {readonly string[]} packages スタイルを入れる部品
 */
function compile(theme, packages) {
	const source = [
		`@use '${theme}';`,
		...packages.map((name) => `@use '${name}/style' as ${name.replace(/\W/g, '_')};`),
	].join('\n');
	return sass
		.compileString(source, {
			loadPaths,
			url: new URL(`file:///${webRoot.replaceAll('\\', '/')}/src/theme/entry.scss`),
			style: 'compressed',
			// SMUI 9 の Sass が使う古い書き方の警告。直すのは SMUI 側なので、変換の出力には出さない
			silenceDeprecations: ['if-function', 'import', 'global-builtin'],
			quietDeps: true,
			// 圧縮した出力は、ASCII でない文字を含むと先頭に BOM が付き、テーマの CSS と先頭がそろわなくなる
		})
		.css.replace(/^\uFEFF/, '');
}

const light = compile('smui-theme', []);
// 部品のスタイルは色を CSS 変数で読むので、ダーク用は変数だけにする (部品のスタイルを 2 回出さない)
const dark = compile('dark/smui-theme', []);
/**
 * ダーク用の CSS から、:root の色の変数だけを取り出し、設定に合わせた選択子にする。
 * SMUI の補助のクラス (.mdc-theme--primary-bg など) も色を変数から読むので、ライト用の定義だけで足りる
 * @param {string} css
 * @param {string} selector
 */
function darkVariables(css, selector) {
	const blocks = css.match(/:root\{[^{}]*\}/g) ?? [];
	if (blocks.length === 0) throw new Error('ダーク用のテーマに :root の変数がありません');
	return blocks.map((block) => block.replace(':root', selector)).join('');
}

// CSS のレイヤーの順番 (後ろほど強い)。全体の要素への指定 (base.scss) < SMUI の部品 < SMUI の見た目の上書き (smui-overrides.scss)。
// 画面ごとのスタイルはレイヤーに入れないので、いつもいちばん強い。部品の CSS はあとから読まれることがあるので、
// 最初に読まれたファイルで順番が決まるよう、どのファイルの先頭にも同じ宣言を置く
const header =
	'/* scripts/build-theme.js が作る。手で直さない */\n@layer base,smui,smui-overrides;';
mkdirSync(generated, { recursive: true });
writeFileSync(
	output,
	[
		header,
		'@layer smui{',
		light,
		// 画面の色の設定 (<html data-theme>) がシステムなら端末の設定に従い、ダークならいつでもダークにする
		`@media (prefers-color-scheme: dark){${darkVariables(dark, ':root:not([data-theme="light"])')}}`,
		darkVariables(dark, ':root[data-theme="dark"]'),
		'}',
		'',
	].join('\n'),
);

// 部品ごとの CSS。テーマを読んだあとに部品を読み、テーマの分 (smui.css にあるもの) を除く。
// 部品どうしが共有する下位の部品 (ripple など) は、それぞれのファイルに入る
rmSync(join(generated, 'smui'), { recursive: true, force: true });
mkdirSync(join(generated, 'smui'), { recursive: true });
for (const name of smuiPackages) {
	const css = compile('smui-theme', [name]);
	if (!css.startsWith(light)) {
		throw new Error(`${name} のスタイルの先頭が、テーマの CSS と一致しません`);
	}
	writeFileSync(
		join(webRoot, smuiStyleFile(name)),
		`${header}\n@layer smui{${css.slice(light.length)}}\n`,
	);
}
console.log(`テーマの CSS を作りました (${smuiPackages.join('、')}): ${generated}`);
