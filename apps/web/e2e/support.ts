// E2E のテストが共有する部品。Google の代わりに、テスト用の OpenID Connect のサーバーを使う。
// サーバーは本物の RS256 で署名した ID トークンを返すので、アプリは本番と同じ手順 (PKCE、state、nonce、署名の検証) を通る。
import { join } from 'node:path';
import {
	createBusStore,
	createSettingsStore,
	createSubjectStore,
	openDatabase,
	type Database,
} from '@funmary/db';
import { expect, test, type Page } from '@playwright/test';
import type {
	MockIdentity,
	TamperMode,
} from '../../../packages/private/auth/src/testing/mock-oidc-server.ts';
import { E2E_DATA_DIR } from '../e2e-data-dir.ts';
import { OIDC_PORT } from '../oidc-port.ts';
import { workerClient } from '../e2e-worker.ts';

/** global-setup.ts が立てたサーバーに、このワーカーの分を頼む */
async function control(path: string, body: object) {
	const response = await fetch(`http://127.0.0.1:${OIDC_PORT}${path}`, {
		method: 'POST',
		body: JSON.stringify({ client: workerClient(), ...body }),
	});
	if (!response.ok)
		throw new Error(`テスト用の OpenID Connect のサーバーが ${response.status} を返しました`);
}

/**
 * 次にログインする人と、ID トークンの改ざんを決める。決めた値は、このワーカーのブラウザからのログインにだけ効く
 * (ブラウザは x-e2e-worker ヘッダーでワーカーを名乗る。playwright.config.js)
 */
export const oidc = {
	setIdentity: (identity: MockIdentity) => control('/__mock/identity', { identity }),
	tamper: (mode: TamperMode) => control('/__mock/tamper', { mode }),
};

/** テストファイルの先頭で呼ぶ。ID トークンを壊したテストのあとに、元に戻す */
export function useMockOidc() {
	test.afterEach(async () => {
		await oidc.tamper('none');
	});
}

/**
 * ログインする。初めてのログインでは、利用規約への同意の画面が出るので、同意して先へ進む
 * (ほとんどのテストは、同意済みの利用者として始めたいため)。同意の流れそのものは、専用のテストで確かめる
 */
export async function signIn(page: Page) {
	await page.goto('/auth/google');
	if (new URL(page.url()).pathname !== '/consent') return;
	await page.getByLabel('利用規約とプライバシーポリシーに同意します').check();
	await page.getByRole('button', { name: '同意して続ける' }).click();
	await expect(page).not.toHaveURL(/\/consent/);
}

/**
 * テストのサーバーと同じ DB を開き、fn を 1 つのトランザクションで動かす。テストのサーバーと書き込みを取り合うので、
 * 初めに書き込みの鍵を取る (IMMEDIATE)。読んでから書くトランザクションは、その間にサーバーが書くと、待たずに
 * database is locked で失敗する (WAL のため)
 */
function withTestDatabase<T>(fn: (database: Database) => T): T {
	const database = openDatabase(join(E2E_DATA_DIR, 'funmary.db'), {
		backupDir: join(E2E_DATA_DIR, 'backups'),
	});
	try {
		return database.sqlite.transaction(() => fn(database)).immediate();
	} finally {
		database.close();
	}
}

/** テストのサーバーと同じ DB を開いて架空の科目を入れ (何度入れても同じになる)、演習の科目の ID と DB を fn に渡す */
export function seedSubjects<T>(fn: (database: Database, exerciseId: number) => T): T {
	return withTestDatabase((database) => {
		const subjects = createSubjectStore(database);
		const base = {
			academicYear: 2026,
			credits: 2,
			attributes: {},
			syllabus: {},
			syllabusUrl: null,
		};
		const exerciseId = subjects.upsert(
			{
				...base,
				syllabusId: '900001',
				name: '架空の演習Ⅱ1-AB',
				teacher: '架空 一郎',
				term: 'fall',
				attributes: { 配当年次: '2年' },
				syllabus: { 授業の概要: '架空の演習の概要です。' },
				syllabusUrl: 'https://syllabus.example.com/900001',
			},
			new Date(),
		);
		subjects.upsert(
			{ ...base, syllabusId: '900002', name: '架空の講義', teacher: null, term: 'q3' },
			new Date(),
		);
		return fn(database, exerciseId);
	});
}

/** 指定したメールアドレスの利用者 (大学のアカウント) として、ログインして、アプリ (/app) を開く。同意の画面は通り抜ける */
export async function signInAs(page: Page, email: string) {
	await oidc.setIdentity({ sub: email, email, email_verified: true, hd: 'fun.ac.jp' });
	await signIn(page);
	await expect(page).toHaveURL('/app');
}

/**
 * バスの時刻表の写しを DB に入れる。毎日 5 時から 24 時まで 30 分おきに、各停留所の発車を入れる (いつ動かしても次のバスがある)。
 * 函館駅前 (A) は、偶数の発車が未来大 (経由に未来大) を通る赤川行、奇数の発車が反対向きの千代台行。
 * 未来大は、偶数の発車が千代台行 (A を通る)、奇数の発車が赤川行。
 * 系統や発車の時刻を差し替えると、開いたままの画面が読み直したかや、最終便のあとの表示を確かめられる
 */
export function seedBus({
	route = '55A',
	times = Array.from({ length: 38 }, (_, index) => {
		const minutes = 5 * 60 + index * 30;
		const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
		return `${hour}:${String(minutes % 60).padStart(2, '0')}`;
	}),
}: { route?: string; times?: string[] } = {}) {
	return withTestDatabase((database) => {
		const bus = createBusStore(database);
		const now = new Date();
		const generation = { code: 20200101, name: '令和2年1月1日', current: true };
		const stops = [
			{ id: '14023', name: 'はこだて未来大学' },
			{ id: '11003', name: '函館駅前' },
			{ id: '11099', name: '赤川１丁目ライフプレステージ白ゆり美原前' },
		];
		bus.saveCatalog(
			{ generatedAt: now.toISOString(), generations: [generation], stops },
			null,
			now,
		);
		const toward = { destination: '赤川', via: '赤川通・はこだて未来大学' };
		const away = { destination: '千代台', via: '亀田支所前' };
		const patterns = new Map([
			['11003', (index: number) => (index % 2 === 0 ? toward : away)],
			['11099', (index: number) => (index % 2 === 0 ? toward : away)],
			['14023', (index: number) => (index % 2 === 0 ? away : { destination: '赤川' })],
		]);
		for (const stop of stops) {
			const pattern = patterns.get(stop.id)!;
			bus.saveTimetable(
				{
					generatedAt: now.toISOString(),
					generation,
					stop,
					timetables: (['weekday', 'holiday'] as const).map((day) => ({
						platformNo: 1,
						platformName: '1 番のりば',
						day,
						notes: ['△＝架空の注意書き'],
						departures: times
							.map((time, index) => ({
								time,
								routes: [route],
								...pattern(index),
								marks: [],
							}))
							// 到着時刻を照合できない便も含める
							.filter((departure) => stop.id !== '14023' || departure.time !== '06:30'),
					})),
				},
				null,
				now,
			);
		}
	});
}

/**
 * 破壊的な操作の前に出る確認のダイアログに答える。ボタンを押したあとに呼ぶ
 * @param accept 「続ける」なら true、「やめる」なら false
 */
export async function answerConfirm(page: Page, accept: boolean) {
	const dialog = page.getByRole('alertdialog');
	await dialog.getByRole('button', { name: accept ? '続ける' : 'やめる' }).click();
	await expect(dialog).toBeHidden();
}

/** 大学のアカウントなら誰でも登録できる形にする (招待コードの流れは単体テストで確かめている) */
export function allowOpenRegistration() {
	withTestDatabase((database) =>
		createSettingsStore(database).set('registration', 'open', new Date()),
	);
}
