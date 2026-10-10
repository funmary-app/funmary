import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { type Database } from '@funmary/db';
import { describe, expect, it } from 'vitest';
import { createApi } from './app.ts';
import { buildMcpServer, buildTermsRequiredMcpServer, createMcpRoutes } from './mcp-routes.ts';
import { useTestDatabase } from '@funmary/db/testing';
import { createTestApiDeps } from './testing.ts';

let database: Database;
useTestDatabase('funmary-mcp-routes-', (db) => (database = db));

const NOW = new Date('2026-10-07T00:00:00Z');

function deps() {
	return createTestApiDeps(database);
}

async function connectedClient(server: ReturnType<typeof buildMcpServer>) {
	const client = new Client({ name: 'test', version: '1' });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
	return client;
}

describe('buildMcpServer', () => {
	it('範囲に合わせて、道具の一覧が変わる', async () => {
		const src = deps();
		const server = buildMcpServer(src, { userId: 'u1', scopes: ['read:lessons'] });
		const client = await connectedClient(server);
		const { tools } = await client.listTools();
		expect(tools.map((tool) => tool.name).sort()).toEqual([
			'get_academic_calendar',
			'get_data_status',
			'get_lessons',
			'get_next_lesson',
			'get_periods',
			'get_subject',
			'get_subject_sessions',
			'get_week',
			'list_courses',
			'list_events',
			'search_subjects',
		]);
		expect(tools.every((tool) => tool.annotations?.readOnlyHint)).toBe(true);
	});

	it('すべての範囲を持つトークンでは、13 の道具がそろう', async () => {
		const src = deps();
		const server = buildMcpServer(src, {
			userId: 'u1',
			scopes: ['read:lessons', 'read:changes', 'read:notifications'],
		});
		const client = await connectedClient(server);
		const { tools } = await client.listTools();
		expect(tools.map((tool) => tool.name).sort()).toEqual([
			'get_academic_calendar',
			'get_data_status',
			'get_lessons',
			'get_next_lesson',
			'get_periods',
			'get_subject',
			'get_subject_sessions',
			'get_week',
			'list_changes',
			'list_courses',
			'list_events',
			'list_notifications',
			'search_subjects',
		]);
	});

	it('get_lessons は、呼んだ本人の授業だけを返す', async () => {
		const src = deps();
		const userId = src.users.createUser(
			{ googleSub: 'a', email: 'a@fun.ac.jp', name: null, role: 'user' },
			NOW,
		);
		const server = buildMcpServer(src, { userId, scopes: ['read:lessons'] });
		const client = await connectedClient(server);
		const result = await client.callTool({
			name: 'get_lessons',
			arguments: { start: '2026-10-01', end: '2026-10-07' },
		});
		expect(result.structuredContent).toMatchObject({ lessons: [], days: [] });
	});

	it('get_periods は時限の時刻を、get_next_lesson は授業がなければ null を返す', async () => {
		const src = deps();
		const server = buildMcpServer(src, { userId: 'u1', scopes: ['read:lessons'] });
		const client = await connectedClient(server);

		const periods = await client.callTool({ name: 'get_periods', arguments: {} });
		const next = await client.callTool({ name: 'get_next_lesson', arguments: {} });

		const list = (periods.structuredContent as { periods: { number: number }[] }).periods;
		expect(list[0]).toEqual({ number: 1, start: '09:00', end: '10:30' });
		expect(list).toHaveLength(6);
		expect(next.structuredContent).toEqual({ next: null });
	});

	it('list_notifications は、呼んだ本人の通知欄だけを返す', async () => {
		const src = deps();
		const userId = src.users.createUser(
			{ googleSub: 'a', email: 'a@fun.ac.jp', name: null, role: 'user' },
			NOW,
		);
		src.notifications.insertMany(
			[
				{
					userId,
					kind: 'cancellation',
					title: '休講',
					body: null,
					link: null,
					subjectId: null,
					dedupeKey: null,
				},
			],
			NOW,
		);
		const server = buildMcpServer(src, { userId, scopes: ['read:notifications'] });
		const client = await connectedClient(server);
		const result = await client.callTool({ name: 'list_notifications', arguments: {} });
		expect(result.structuredContent).toMatchObject({ notifications: [{ title: '休講' }] });
	});
});

describe('OAuth 向けの案内', () => {
	it('トークンなしの 401 に、保護されたリソースの情報の URL を載せる', async () => {
		const app = createMcpRoutes({
			...deps(),
			resourceMetadataUrl: 'https://funmary.example.com/.well-known/oauth-protected-resource/mcp',
		});

		const res = await app.request('/mcp', { method: 'POST' });

		expect(res.status).toBe(401);
		expect(res.headers.get('WWW-Authenticate')).toBe(
			'Bearer resource_metadata="https://funmary.example.com/.well-known/oauth-protected-resource/mcp"',
		);
	});

	it('オリジンを渡すと、サーバーの情報に、アイコンの絶対 URL を載せる', async () => {
		const server = buildMcpServer(
			{ ...deps(), origin: 'https://funmary.example.com/' },
			{ userId: 'u1', scopes: [] },
		);
		const client = await connectedClient(server);

		const icons = client.getServerVersion()?.icons ?? [];

		expect(icons.map((icon) => icon.src)).toEqual([
			'https://funmary.example.com/brand/icon-512.png',
			'https://funmary.example.com/brand/icon.svg',
			'https://funmary.example.com/brand/icon-dark.svg',
		]);
	});
});

describe('利用規約への同意を待っている利用者', () => {
	it('データの道具は出さず、同意が要ることと URL を、道具の答えで知らせる', async () => {
		const server = buildTermsRequiredMcpServer('https://funmary.example.com/consent');
		const client = await connectedClient(server);

		const { tools } = await client.listTools();
		const result = await client.callTool({ name: 'terms_acceptance_required', arguments: {} });

		expect(tools.map((tool) => tool.name)).toEqual(['terms_acceptance_required']);
		expect(result.isError).toBe(true);
		expect(JSON.stringify(result.content)).toContain('https://funmary.example.com/consent');
		expect(client.getInstructions()).toContain('https://funmary.example.com/consent');
	});

	it('HTTP の口でも、持ち主が同意していなければ、データの道具の代わりにこの道具を出す', async () => {
		const src = deps();
		const userId = src.users.createUser(
			{ googleSub: 'a', email: 'a@fun.ac.jp', name: null, role: 'user' },
			NOW,
		);
		const token = src.accessTokens.issue(
			userId,
			{ name: 'test', scopes: ['read:lessons'] },
			new Date(Date.now() + 24 * 60 * 60 * 1000),
			NOW,
		);
		const app = createMcpRoutes({
			...src,
			termsGate: { version: '2026-10-03', consentUrl: 'https://funmary.example.com/consent' },
		});
		const call = (method: string) =>
			app.request('/mcp', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					Accept: 'application/json, text/event-stream',
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method,
					params: {
						protocolVersion: '2025-06-18',
						capabilities: {},
						clientInfo: { name: 't', version: '1' },
					},
				}),
			});

		const res = await call('initialize');

		expect(res.status).toBe(200);
		expect(await res.text()).toContain('https://funmary.example.com/consent');

		// 同意すれば、ふつうの道具が出る
		src.users.acceptTerms(userId, '2026-10-03', NOW);
		const accepted = await call('initialize');
		expect(await accepted.text()).not.toContain('https://funmary.example.com/consent');
	});
});

describe('対応していないプロトコルの版を名乗るクライアント', () => {
	it('サーバーの 500 ではなく、400 と対応する版の一覧で断る', async () => {
		const src = deps();
		const userId = src.users.createUser(
			{ googleSub: 'a', email: 'a@fun.ac.jp', name: null, role: 'user' },
			NOW,
		);
		const token = src.accessTokens.issue(
			userId,
			{ name: 'test', scopes: ['read:lessons'] },
			new Date(Date.now() + 24 * 60 * 60 * 1000),
			NOW,
		);
		const errors: unknown[] = [];
		const api = createApi({
			checkHealth: () => true,
			mcp: src,
			onError: (error) => errors.push(error),
		});

		const res = await api.request('/mcp', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
				Accept: 'application/json, text/event-stream',
				'mcp-protocol-version': '2099-01-01',
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
		});

		expect(res.status).toBe(400);
		expect(JSON.stringify(await res.json())).toContain('2025-06-18');
		expect(errors).toEqual([]);
	});
});

describe('トランスポートが投げるクライアントの誤り', () => {
	it('Accept が足りないときは、サーバーの 500 ではなく 406 を返し、例外として記録しない', async () => {
		const src = deps();
		const userId = src.users.createUser(
			{ googleSub: 'a', email: 'a@fun.ac.jp', name: null, role: 'user' },
			NOW,
		);
		const token = src.accessTokens.issue(
			userId,
			{ name: 'test', scopes: ['read:lessons'] },
			new Date(Date.now() + 24 * 60 * 60 * 1000),
			NOW,
		);
		const errors: unknown[] = [];
		const api = createApi({
			checkHealth: () => true,
			mcp: src,
			onError: (error) => errors.push(error),
		});

		const res = await api.request('/mcp', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
				Accept: 'text/html',
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
		});

		expect(res.status).toBe(406);
		expect(errors).toEqual([]);
	});
});
