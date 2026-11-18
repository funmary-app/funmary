import { defineProject } from 'vitest/config';

export default defineProject({
	test: {
		name: 'db',
		include: ['src/**/*.test.ts'],
		environment: 'node',
		// SQLite のファイルを作って消すテストが多い。Windows の CI (ファイル操作が遅い) で、並列に動くほかのテストと重なっても 5 秒の既定では足りないことがあったので、余裕を持たせる
		testTimeout: 30_000,
		hookTimeout: 30_000,
	},
});
