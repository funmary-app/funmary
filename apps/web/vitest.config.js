import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineProject } from 'vitest/config';
import { sharedTestOptions } from '../../vitest.shared.js';

// apps/web の単体テスト (ルートの vitest.config.js が 1 回の実行にまとめる)。
// SvelteKit の Vite プラグインは作業ディレクトリを基準にするので、ここでは読み込まない。
// .svelte.ts のモジュールの $state などを変換するために、Svelte のプラグインだけを使う
export default defineProject({
	plugins: [svelte()],
	test: {
		...sharedTestOptions,
		name: 'web',
		include: ['src/**/*.test.ts', 'scripts/**/*.test.js'],
		environment: 'node',
	},
});
