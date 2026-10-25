// ほかのテストの前に、登録の方式を「誰でも登録できる」にする。登録の方式は管理画面で変える設定なので、
// サーバーが DB を作ったあと (healthz.test.ts のあと) に入れる
import { test as setup } from '@playwright/test';
import { allowOpenRegistration } from './support.ts';

setup('登録の方式を、誰でも登録できる形にする', () => {
	allowOpenRegistration();
});
