import { defineConfig, devices } from '@playwright/test';
import { E2E_DATA_DIR, E2E_SHARED_DATA_DIR } from './e2e-data-dir.ts';
import { OIDC_PORT } from './oidc-port.ts';
import { workerClient } from './e2e-worker.ts';
import { generateSecrets } from './src/lib/server/env-file.ts';

const port = 4173;
/** 全体の設定を変えるテストだけが使う、2 つ目のサーバーのポート (4174 は OIDC_PORT) */
const sharedPort = 4175;

/** 全体の設定を変えるテストのファイル。ほかのテストの確かめる画面を変えてしまうので、2 つ目のサーバーと別の DB で動かす */
const SHARED_SETTINGS = ['admin.test.ts', 'notifications.test.ts'];

const secrets = generateSecrets();

/**
 * テスト用のサーバーに渡す環境変数。本番と同じ検査を通る形にした架空の値
 * @param {number} serverPort
 * @param {string} dataDir
 */
const serverEnv = (serverPort, dataDir) => ({
	...secrets,
	ORIGIN: `http://localhost:${serverPort}`,
	GOOGLE_CLIENT_ID: 'e2e.apps.googleusercontent.com',
	GOOGLE_CLIENT_SECRET: 'e2e-client-secret',
	// Google の代わりに、e2e/global-setup.ts が立てる OpenID Connect のサーバーを使う
	OIDC_ISSUER: `http://127.0.0.1:${OIDC_PORT}`,
	// このアドレスでログインした利用者は管理者になる (管理画面のテストに使う)
	ADMIN_EMAILS: 'e2e-admin@fun.ac.jp',
	PORTAL_USER_ID: 'e2e-student',
	PORTAL_PASSWORD: 'e2e-password',
	DATA_DIR: dataDir,
	// 手元の .env に本物の Bot のトークンがあっても、テストでは使わない (空の値は、設定しないのと同じ)
	DISCORD_BOT_TOKEN: '',
	DISCORD_GUILD_ID: '',
	ADMIN_DISCORD_WEBHOOK_URL: '',
	DISCORD_CLIENT_ID: '',
	DISCORD_CLIENT_SECRET: '',
	// 本物の Discord へ送らない (Webhook のテスト通知も、送らずに送れたことにする)
	NOTIFY_DRY_RUN: 'true',
	// バスの機能を有効にする。時刻表はテストが DB に直接入れるので、この URL には接続しない
	BUS_API_BASE_URL: 'http://127.0.0.1:9',
});

/** 2 つ目のサーバーで動かすプロジェクトの設定 */
const sharedServer = {
	use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${sharedPort}` },
	metadata: { dataDir: E2E_SHARED_DATA_DIR },
};

export default defineConfig({
	testDir: 'e2e',
	forbidOnly: !!process.env['CI'],
	// OpenID Connect サーバーは 1 つだけ起動し、ログインに使うアカウントをワーカーごとに分ける。
	globalSetup: './e2e/global-setup.ts',
	workers: 4,
	retries: process.env['CI'] ? 2 : 0,
	reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: `http://localhost:${port}`,
		trace: 'on-first-retry',
		// どのワーカーのブラウザかを、テスト用の OpenID Connect のサーバーに伝える (e2e-worker.ts)
		extraHTTPHeaders: { 'x-e2e-worker': workerClient() },
	},
	projects: [
		// 初めにサーバーが動いていることを確かめる
		{
			name: 'server',
			use: { ...devices['Desktop Chrome'] },
			testMatch: 'healthz.test.ts',
		},
		// サーバーが DB を作ったあとに、登録の方式を入れる (registration.setup.ts)
		{
			name: 'registration',
			use: { ...devices['Desktop Chrome'] },
			testMatch: 'registration.setup.ts',
			dependencies: ['server'],
		},
		// 全体の設定 (曜日と時限の登録のしかた、学期の期間、招待の方式、Webhook の上限など) を変えるファイルは、
		// 2 つ目のサーバーで、ほかのファイルと同時に動かす。この 2 つのファイルは、互いに別の設定を変えるので、並べて動かせる。
		// Playwright は、同時に動かせるテストを projects の順に配るので、時間のかかるこのファイルを先に置いて、最後まで残らないようにする
		{ ...sharedServer, name: 'shared-server', testMatch: 'healthz.test.ts' },
		{
			...sharedServer,
			name: 'shared-registration',
			testMatch: 'registration.setup.ts',
			dependencies: ['shared-server'],
		},
		{
			...sharedServer,
			name: 'shared-settings',
			testMatch: SHARED_SETTINGS,
			dependencies: ['shared-registration'],
			workers: 2,
		},
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
			testIgnore: ['healthz.test.ts', ...SHARED_SETTINGS],
			dependencies: ['registration'],
		},
	],
	// 上から順に起動する。2 つ目は、1 つ目がビルドを終えて起動してから、同じビルドを別のポートと DB で動かす
	webServer: [
		{
			command: `pnpm build && pnpm preview --port ${port} --strictPort`,
			port,
			// サーバーのログを、テストの出力に混ぜる (失敗の原因を追えるように)
			stdout: 'pipe',
			stderr: 'pipe',
			reuseExistingServer: !process.env['CI'],
			// 起動の前にビルドする。依存をすべて同梱し PDF の読み取りも入るので、手元では 1 分ほどかかる
			timeout: 180_000,
			env: serverEnv(port, E2E_DATA_DIR),
		},
		{
			command: `pnpm preview --port ${sharedPort} --strictPort`,
			port: sharedPort,
			stdout: 'pipe',
			stderr: 'pipe',
			reuseExistingServer: !process.env['CI'],
			timeout: 60_000,
			env: serverEnv(sharedPort, E2E_SHARED_DATA_DIR),
		},
	],
});
