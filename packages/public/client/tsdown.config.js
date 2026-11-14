import { defineConfig } from 'tsdown';

// npm に出す JavaScript (ESM) と型定義を作る。ofetch は dependencies のまま、同梱しない
export default defineConfig({
	entry: { index: 'src/index.ts' },
	format: 'esm',
	platform: 'neutral',
	target: 'node20',
	outDir: 'dist',
	clean: true,
	fixedExtension: false,
	dts: true,
	// ライセンスの本文を、公開するパッケージに含める
	copy: ['../../../LICENSE-APACHE', '../../../LICENSE-BSD-3-CLAUSE'],
});
