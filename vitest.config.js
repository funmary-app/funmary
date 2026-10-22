import { defineConfig } from 'vitest/config';

// パッケージごとの設定 (vitest.config.js) を 1 回の実行にまとめる
export default defineConfig({
	test: {
		projects: [
			'packages/*/*',
			{
				// GitHub Actions から呼ぶスクリプトの、判断の部分を試す
				test: {
					name: 'scripts',
					include: ['scripts/**/*.test.js'],
					environment: 'node',
				},
			},
			{
				// SvelteKit の Vite プラグインは作業ディレクトリを基準にするので、ここでは読み込まない。
				// .svelte のコンポーネントを試すときは @sveltejs/vite-plugin-svelte を足す
				test: {
					name: 'web',
					root: 'apps/web',
					include: ['src/**/*.test.ts', 'scripts/**/*.test.js'],
					environment: 'node',
				},
			},
		],
	},
});
