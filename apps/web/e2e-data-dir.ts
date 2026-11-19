import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * E2E テストのサーバーが DB を置く場所。テスト本体は、ここの DB に科目を入れてから画面を確かめる。
 * Playwright はテストの前に test-results を消すので、別の場所に置く
 */
export const E2E_DATA_DIR = join(tmpdir(), 'funmary-e2e-data');

/**
 * 全体の設定を変えるテスト (playwright.config.js の SHARED_SETTINGS) だけが使う、2 つ目のサーバーの DB の場所。
 * ほかのテストと DB を分けると、設定を変えても、ほかのテストの確かめる画面が変わらないので、同時に動かせる
 */
export const E2E_SHARED_DATA_DIR = join(tmpdir(), 'funmary-e2e-data-shared');
