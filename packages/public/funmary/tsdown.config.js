import { defineConfig } from 'tsdown';

// npm に出す JavaScript (ESM) と型定義を作る。依存 (@funmary/client、@funmary/mcp) は、同梱しない
export default defineConfig({
	entry: { index: 'src/index.ts', mcp: 'src/mcp.ts', cli: 'src/cli.ts', bin: 'src/bin.ts' },
	format: 'esm',
	platform: 'node',
	target: 'node20',
	outDir: 'dist',
	clean: true,
	fixedExtension: false,
	dts: { entry: ['src/index.ts', 'src/mcp.ts', 'src/cli.ts'] },
	// ライセンスの本文を、公開するパッケージに含める
	copy: ['../../../LICENSE-APACHE', '../../../LICENSE-BSD-3-CLAUSE'],
});
