import { FunmaryApiError, type FunmaryClient } from '@funmary/client';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { run, normalizeBaseUrl, type CliDeps } from './cli.ts';

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// 2026-10-07 (水) 日本時間 10:00
const NOW = new Date('2026-10-07T01:00:00Z');

const lesson = {
	date: '2026-10-07',
	period: 2,
	start: '10:45',
	end: '12:15',
	subjectName: '線形代数',
	room: '363',
	status: 'normal',
	change: null,
};

function fakeClient(overrides: Record<string, unknown> = {}) {
	return {
		me: vi.fn(() => Promise.resolve({ id: 'u', email: 'a@fun.ac.jp', scopes: ['read:lessons'] })),
		timetable: vi.fn(() => Promise.resolve({ lessons: [lesson], days: [] })),
		events: { list: vi.fn(() => Promise.resolve([])) },
		week: vi.fn(() => Promise.resolve({ days: [] })),
		changes: vi.fn(() => Promise.resolve([])),
		bus: {
			stops: vi.fn(() =>
				Promise.resolve({
					stops: [
						{ id: '14013', name: '亀田支所前', highlighted: true },
						{ id: '14023', name: 'はこだて未来大学', highlighted: true },
						{ id: '11003', name: '函館駅前', highlighted: false },
					],
				}),
			),
			legs: vi.fn(({ direction }: { direction: string }) =>
				Promise.resolve({
					from: { name: direction === 'toUniversity' ? '亀田支所前' : 'はこだて未来大学' },
					to: { name: direction === 'toUniversity' ? 'はこだて未来大学' : '亀田支所前' },
					day: 'weekday',
					todayDay: 'weekday',
					checkedAt: '2026-10-10T00:00:00Z',
					departures: [
						{
							time: '10:05',
							arrivalTime: '10:30',
							from: { name: '亀田支所前' },
							to: { name: 'はこだて未来大学' },
							routes: ['55A'],
							destination: '赤川',
						},
					],
				}),
			),
		},
		...overrides,
	};
}

function setup(
	options: { client?: ReturnType<typeof fakeClient>; stored?: boolean; token?: string } = {},
) {
	const dir = mkdtempSync(join(tmpdir(), 'funmary-cli-run-'));
	dirs.push(dir);
	const out: string[] = [];
	const err: string[] = [];
	const client = options.client ?? fakeClient();
	const runMcp = vi.fn(() => Promise.resolve());
	const deps: CliDeps = {
		env: { FUNMARY_CONFIG_DIR: dir },
		platform: 'linux',
		home: dir,
		now: () => NOW,
		out: (line) => out.push(line),
		err: (line) => err.push(line),
		width: 100,
		isTTY: false,
		readToken: () => Promise.resolve(options.token ?? 'fmy_typed'),
		createClient: () => client as unknown as FunmaryClient,
		runMcp,
		version: '1.2.3',
	};
	return { deps, out, err, client, runMcp, dir };
}

async function loggedIn() {
	const ctx = setup();
	await run(['login', '--url', 'https://funmary.example.com'], ctx.deps);
	ctx.out.length = 0;
	return ctx;
}

describe('ヘルプと版', () => {
	it('--version は版、--help は説明を出す。コマンドなしは、説明を出して、終了コード 2', async () => {
		const { deps, out } = setup();
		expect(await run(['--version'], deps)).toBe(0);
		expect(out).toEqual(['1.2.3']);
		out.length = 0;
		expect(await run(['--help'], deps)).toBe(0);
		expect(out.join('\n')).toContain('login');
		expect(await run([], deps)).toBe(2);
	});

	it('知らないコマンドと、知らないオプションは、終了コード 2', async () => {
		const { deps, err } = setup();
		expect(await run(['dance'], deps)).toBe(2);
		expect(err.join('\n')).toContain('知らないコマンド');
		expect(await run(['today', '--nope'], deps)).toBe(2);
	});
});

describe('normalizeBaseUrl', () => {
	it('https と、手元の http だけを受け付け、末尾やパスを落とす', () => {
		expect(normalizeBaseUrl('https://funmary.example.com/app/')).toBe(
			'https://funmary.example.com',
		);
		expect(normalizeBaseUrl('http://localhost:4173')).toBe('http://localhost:4173');
		expect(() => normalizeBaseUrl('http://funmary.example.com')).toThrow('https://');
		expect(() => normalizeBaseUrl('not a url')).toThrow('URL を読めません');
	});
});

describe('login と logout', () => {
	it('トークンを標準入力から読み、確かめて、保存する。トークンは、出力に出さない', async () => {
		const { deps, out, err, dir } = setup({ token: 'fmy_secret_value' });
		expect(await run(['login', '--url', 'https://funmary.example.com'], deps)).toBe(0);
		expect(out.join('\n')).toContain('ログインしました');
		expect(out.join('\n')).toContain('read:lessons');
		expect(out.join('\n') + err.join('\n')).not.toContain('fmy_secret_value');
		expect(readFileSync(join(dir, 'config.json'), 'utf8')).toContain('fmy_secret_value');
	});

	it('URL を省くと、保存した URL を使う。どちらもなければ、終了コード 2', async () => {
		const first = await loggedIn();
		expect(await run(['login'], first.deps)).toBe(0);
		const { deps, err } = setup();
		expect(await run(['login'], deps)).toBe(2);
		expect(err.join('\n')).toContain('--url');
	});

	it('トークンが使えなければ、保存しない', async () => {
		const client = fakeClient({
			me: vi.fn(() =>
				Promise.reject(new FunmaryApiError({ status: 401, code: 'unauthorized', message: 'x' })),
			),
		});
		const { deps, err, dir } = setup({ client });
		expect(await run(['login', '--url', 'https://funmary.example.com'], deps)).toBe(1);
		expect(err.join('\n')).toContain('アクセストークンが使えません');
		expect(() => readFileSync(join(dir, 'config.json'), 'utf8')).toThrow();
	});

	it('logout は、保存した設定を消す', async () => {
		const { deps, out } = await loggedIn();
		expect(await run(['logout'], deps)).toBe(0);
		expect(out[0]).toContain('消しました');
		out.length = 0;
		await run(['logout'], deps);
		expect(out[0]).toContain('ありません');
	});

	it('ログインしていないと、ほかのコマンドは、login を案内して、終了コード 1', async () => {
		const { deps, err } = setup();
		expect(await run(['today'], deps)).toBe(1);
		expect(err.join('\n')).toContain('funmary login');
	});
});

describe('today、week、changes', () => {
	it('today は、日本時間の今日の授業と予定を出す', async () => {
		const { deps, out, client } = await loggedIn();
		expect(await run(['today'], deps)).toBe(0);
		expect(client.timetable).toHaveBeenCalledWith({ start: '2026-10-07', end: '2026-10-07' });
		expect(out.join('\n')).toContain('10/07 (水)');
		expect(out.join('\n')).toContain('線形代数');
	});

	it('--json は、表ではなく、JSON を出す', async () => {
		const { deps, out } = await loggedIn();
		await run(['today', '--json'], deps);
		const parsed = JSON.parse(out.join('\n')) as { date: string; lessons: unknown[] };
		expect(parsed.date).toBe('2026-10-07');
		expect(parsed.lessons).toHaveLength(1);
	});

	it('week は、--date を渡せる。形が違えば、終了コード 2', async () => {
		const { deps, client } = await loggedIn();
		await run(['week', '--date', '2026-10-14'], deps);
		expect(client.week).toHaveBeenCalledWith({ date: '2026-10-14' });
		expect(await run(['week', '--date', '10/14'], deps)).toBe(2);
	});

	it('changes は、今日から --days 日 (既定 14) の範囲で取る', async () => {
		const { deps, client } = await loggedIn();
		await run(['changes'], deps);
		expect(client.changes).toHaveBeenLastCalledWith({ start: '2026-10-07', end: '2026-10-20' });
		await run(['changes', '--days', '3'], deps);
		expect(client.changes).toHaveBeenLastCalledWith({ start: '2026-10-07', end: '2026-10-09' });
		expect(await run(['changes', '--days', '0'], deps)).toBe(2);
	});

	it('API の誤りは、理由を出して、終了コード 1。同意待ちなら、同意画面の URL も出す', async () => {
		const client = fakeClient({
			timetable: vi.fn(() =>
				Promise.reject(
					new FunmaryApiError({
						status: 403,
						code: 'terms_not_accepted',
						message: '同意が必要です',
						body: { consentUrl: 'https://funmary.example.com/consent' },
					}),
				),
			),
		});
		const ctx = setup({ client });
		await run(['login', '--url', 'https://funmary.example.com'], ctx.deps);
		expect(await run(['today'], ctx.deps)).toBe(1);
		expect(ctx.err.join('\n')).toContain('https://funmary.example.com/consent');
	});
});

describe('bus', () => {
	it('バス停を省くと、強調する停留所 (未来大以外) の、2 つの向きを出す', async () => {
		const { deps, out, client } = await loggedIn();
		expect(await run(['bus'], deps)).toBe(0);
		expect(client.bus.legs).toHaveBeenCalledTimes(2);
		expect(client.bus.legs).toHaveBeenCalledWith({ stopId: '14013', direction: 'toUniversity' });
		expect(out.join('\n')).toContain('亀田支所前 → はこだて未来大学');
		expect(out.join('\n')).toContain('はこだて未来大学 → 亀田支所前');
		expect(out.join('\n')).toContain('10:05');
	});

	it('--stop は、番号か名前で指す。--from か --to で、向きを 1 つにできる', async () => {
		const { deps, client } = await loggedIn();
		await run(['bus', '--stop', '函館', '--from', '--day', 'holiday'], deps);
		expect(client.bus.legs).toHaveBeenCalledTimes(1);
		expect(client.bus.legs).toHaveBeenCalledWith({
			stopId: '11003',
			direction: 'fromUniversity',
			day: 'holiday',
		});
		await run(['bus', '--stop', '14013', '--to'], deps);
		expect(client.bus.legs).toHaveBeenLastCalledWith({
			stopId: '14013',
			direction: 'toUniversity',
		});
	});

	it('ないバス停、重なる指定、不正なオプションは、理由を出して終わる', async () => {
		const { deps, err } = await loggedIn();
		expect(await run(['bus', '--stop', 'ない'], deps)).toBe(1);
		expect(err.join('\n')).toContain('見つかりません');
		expect(await run(['bus', '--to', '--from'], deps)).toBe(2);
		expect(await run(['bus', '--day', 'friday'], deps)).toBe(2);
		expect(await run(['bus', '--limit', '99'], deps)).toBe(2);
	});

	it('--json は、向きごとの JSON の配列を出す', async () => {
		const { deps, out } = await loggedIn();
		await run(['bus', '--json'], deps);
		expect((JSON.parse(out.join('\n')) as unknown[]).length).toBe(2);
	});
});

describe('mcp', () => {
	it('保存した接続先とトークンで、手元の MCP を起動する', async () => {
		const { deps, runMcp } = await loggedIn();
		expect(await run(['mcp'], deps)).toBe(0);
		expect(runMcp).toHaveBeenCalledWith({
			baseURL: 'https://funmary.example.com',
			token: 'fmy_typed',
		});
	});
});
