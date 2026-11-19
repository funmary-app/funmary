import { defineConfig } from 'vitest/config';
import { sharedTestOptions } from './vitest.shared.js';

// パッケージごとの設定 (vitest.config.js) を 1 回の実行にまとめる
export default defineConfig({
	test: {
		projects: [
			'packages/*/*',
			{
				// GitHub Actions から呼ぶスクリプトの、判断の部分を試す
				test: {
					...sharedTestOptions,
					name: 'scripts',
					include: ['scripts/**/*.test.js'],
					environment: 'node',
				},
			},
			'apps/web/vitest.config.js',
		],
	},
});
