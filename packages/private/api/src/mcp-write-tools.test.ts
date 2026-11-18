import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { type AccessTokenScope, type Database } from '@funmary/db';
import { useTestDatabase } from '@funmary/db/testing';
import { describe, expect, it } from 'vitest';
import { buildMcpServer } from './mcp-routes.ts';
import { createTestApiDeps } from './testing.ts';

let database: Database;
useTestDatabase('funmary-mcp-write-', (db) => (database = db));

const NOW = new Date('2026-10-07T00:00:00Z');

async function setup(scopes: AccessTokenScope[]) {
	const src = createTestApiDeps(database);
	const userId = src.users.createUser(
		{ googleSub: 'a', email: 'a@fun.ac.jp', name: null, role: 'user' },
		NOW,
	);
	const server = buildMcpServer(src, {
		userId,
		scopes,
		tokenId: 5,
		tokenName: '手元の Claude Desktop',
	});
	const client = new Client({ name: 'test', version: '1' });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
	const call = (name: string, args: Record<string, unknown> = {}) =>
		client.callTool({ name, arguments: args }) as Promise<{
			isError?: boolean;
			structuredContent?: Record<string, unknown>;
			content: { type: string; text: string }[];
		}>;
	return { src, userId, client, call };
}

const EVENT = {
	title: '歯医者',
	startDate: '2026-10-20',
	time: { kind: 'time', start: '10:00', end: '11:00' },
};

describe('MCP の書き込みのツール', () => {
	it('書き込みの範囲がなければ、書き込みのツールは出ない', async () => {
		const { client } = await setup(['read:lessons', 'read:changes', 'read:notifications']);

		const names = (await client.listTools()).tools.map((tool) => tool.name);

		expect(names).not.toContain('create_event');
		expect(names).not.toContain('delete_event');
		expect(names).not.toContain('mark_notification_read');
	});

	it('write:events で予定の書き込みツールを公開し、削除には destructiveHint を付ける', async () => {
		const { client } = await setup(['write:events']);

		const tools = (await client.listTools()).tools;

		expect(tools.map((tool) => tool.name).sort()).toEqual([
			'create_event',
			'delete_event',
			'update_event',
		]);
		for (const tool of tools) expect(tool.annotations?.readOnlyHint).toBe(false);
		const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool.annotations]));
		expect(byName['delete_event']?.destructiveHint).toBe(true);
		expect(byName['update_event']?.idempotentHint).toBe(true);
		expect(byName['create_event']?.destructiveHint).toBe(false);
	});

	it('write:notifications では、既読のツールが出る', async () => {
		const { client } = await setup(['write:notifications']);

		const tools = (await client.listTools()).tools;

		expect(tools.map((tool) => tool.name).sort()).toEqual([
			'mark_all_notifications_read',
			'mark_notification_read',
		]);
		for (const tool of tools) expect(tool.annotations?.idempotentHint).toBe(true);
	});

	it('read:lessons があれば、予定を 1 件読むツールも出る', async () => {
		const { client } = await setup(['read:lessons']);

		expect((await client.listTools()).tools.map((tool) => tool.name)).toContain('get_event');
	});

	it('予定を足し、読み、直し、消せる。履歴にトークンの名前が残る', async () => {
		const { src, userId, call } = await setup(['read:lessons', 'write:events']);

		const created = await call('create_event', EVENT);
		expect(created.isError).toBeFalsy();
		const id = (created.structuredContent as { id: number }).id;
		expect(created.structuredContent).toMatchObject({ title: '歯医者', repeat: null });

		expect((await call('get_event', { id })).structuredContent).toMatchObject({
			id,
			title: '歯医者',
		});
		const updated = await call('update_event', { id, ...EVENT, title: '歯医者 (変更)' });
		expect(updated.structuredContent).toMatchObject({ id, title: '歯医者 (変更)' });
		expect((await call('delete_event', { id })).isError).toBeFalsy();

		expect(src.userEvents.get(id, userId)).toBeNull();
		expect(src.activity.listRecent(userId).map((row) => row.action)).toEqual([
			'event.delete',
			'event.update',
			'event.create',
		]);
		expect(src.activity.listRecent(userId)[0]).toMatchObject({
			tokenId: 5,
			tokenName: '手元の Claude Desktop',
		});
	});

	it('誤った入力と、ない予定は、エラーとして返す (画面と同じ文)', async () => {
		const { call } = await setup(['write:events']);

		const invalid = await call('create_event', { ...EVENT, title: '' });
		expect(invalid.isError).toBe(true);
		expect(invalid.content[0]?.text).toBe('予定の名前を入れてください。');

		const missing = await call('delete_event', { id: 999 });
		expect(missing.isError).toBe(true);
		expect(missing.content[0]?.text).toBe('予定が見つかりません');
	});

	it('通知を、1 件ずつも、まとめても、既読にできる', async () => {
		const { src, userId, call } = await setup(['write:notifications']);
		const ids = src.notifications.insertMany(
			['1 つ目', '2 つ目'].map((title) => ({
				userId,
				kind: 'notice' as const,
				title,
				body: null,
				link: null,
				subjectId: null,
				dedupeKey: title,
			})),
			NOW,
		);

		const one = await call('mark_notification_read', { id: ids[0] });
		expect(one.structuredContent).toMatchObject({ id: ids[0] });
		const all = await call('mark_all_notifications_read');
		expect(all.structuredContent).toEqual({ count: 1 });
		expect(src.notifications.unreadCount(userId)).toBe(0);
	});
});
