/**
 * E2E のワーカーの名前。ブラウザは、x-e2e-worker ヘッダーでこれを名乗り (playwright.config.js)、テスト用の
 * OpenID Connect のサーバーは、名前ごとに、次にログインする人を分ける。ワーカーは別のプロセスなので、
 * Playwright が各ワーカーに渡す TEST_PARALLEL_INDEX を使う
 */
export const workerClient = () => process.env['TEST_PARALLEL_INDEX'] ?? 'main';
