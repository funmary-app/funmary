import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default defineConfig(
	{
		ignores: [
			'**/build/',
			'**/.svelte-kit/',
			'**/dist/',
			'**/coverage/',
			'**/.mutator/',
			'packages/public/client/src/generated/',
			'**/playwright-report/',
			'**/test-results/',
			// pnpm package-release が作るリリース
			'release/',
			'.agents/',
			'.private/',
		],
	},
	js.configs.recommended,
	ts.configs.recommendedTypeChecked,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
			parserOptions: { projectService: true, extraFileExtensions: ['.svelte'] },
		},
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: { parserOptions: { parser: ts.parser } },
	},
	{
		// 設定ファイルなどの .js は型の検査の対象外にする
		files: ['**/*.js'],
		ignores: ['scripts/**', 'apps/web/scripts/**'],
		extends: [ts.configs.disableTypeChecked],
	},
);
