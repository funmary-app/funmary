import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
import Icons from 'unplugin-icons/vite';
import { defineConfig } from 'vite';
import { BUILD_ALIASES, UNBUNDLED_DEPS } from './bundled-deps.js';
import { smuiStyles } from './scripts/smui-styles.js';

// 単体テストの設定はルートの vitest.config.js に置く
export default defineConfig(({ command }) => ({
	// adapter-node は dependencies をビルドの外に置き、実行時に読み込む。VPS には better-sqlite3 しか入れないので、
	// ビルドでは、ほかの依存をすべて同梱する。開発サーバーでは、読み込みを速くするため同梱しない
	...(command === 'build' && {
		ssr: {
			// adapter-node 6 は、noExternal が配列でないと dependencies をすべて外に置く。配列で "UNBUNDLED_DEPS 以外すべて" を同梱にする
			noExternal: [new RegExp(`^(?!(?:${UNBUNDLED_DEPS.join('|')})(?:/|$))`)],
			external: UNBUNDLED_DEPS,
		},
		resolve: { alias: BUILD_ALIASES },
	}),
	plugins: [
		sveltekit({
			// <style lang="scss"> を Sass として変換する
			preprocess: vitePreprocess(),

			// 静的ファイルを gzip と Brotli で事前に圧縮しておく
			adapter: adapter({ precompress: true }),

			// 組み込みの Origin の検査は切り、hooks.server.ts で同じ検査を行う (OAuth のトークンの口だけ、Origin なしの form を通すため)
			csrf: { trustedOrigins: ['*'] },

			// .env はリポジトリのルートに置く。管理用コマンドと同じファイルを読む
			env: { dir: '../..' },
		}),

		// 使ったアイコンだけを、ビルド時に SVG の Svelte コンポーネントにして埋め込む
		Icons({ compiler: 'svelte' }),

		// SMUI の部品の CSS を、その部品を使うページだけで読ませる
		smuiStyles(),
	],
	css: {
		preprocessorOptions: {
			scss: {
				// コンポーネントの <style lang="scss"> から @use 'breakpoints' で読めるようにする
				loadPaths: [fileURLToPath(new URL('./src/lib/styles', import.meta.url))],
			},
		},
	},
}));
