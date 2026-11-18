/**
 * テスト用 OpenID Connect サーバーがログイン情報をワーカーごとに分けるための名前。
 * ワーカーは別プロセスで動くため、Playwright が渡す TEST_PARALLEL_INDEX を x-e2e-worker ヘッダーで送る。
 */
export const workerClient = () => process.env['TEST_PARALLEL_INDEX'] ?? 'main';
