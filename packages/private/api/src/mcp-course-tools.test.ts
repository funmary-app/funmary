import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { type Database } from '@funmary/db';
import { useTestDatabase } from '@funmary/db/testing';
import { describe, expect, it } from 'vitest';
import { buildMcpServer } from './mcp-routes.ts';
import { createTestApiDeps } from './testing.ts';

let database: Database;
useTestDatabase('funmary-mcp-course-', (db) => (database = db));

const NOW = new Date('2026-10-07T00:00:00Z');

async function setup(scopes: string[]) {
	const src = createTestApiDeps(database);
	const userId = src.users.createUser(
		{ googleSub: 'a', email: 'a@fun.ac.jp', name: null, role: 'user' },
		NOW,
	);
	const base = {
		academicYear: 2026,
		credits: 2,
		teacher: null,
		term: 'fall' as const,
		attributes: {},
		syllabus: {},
		syllabusUrl: null,
	};
	src.subjects.upsert({ ...base, syllabusId: '100', name: '線形代数' }, NOW);
	src.subjects.upsert({ ...base, syllabusId: '200', name: '情報アーキテクチャ' }, NOW);
	src.subjects.upsert({ ...base, syllabusId: '201', name: '情報アーキテクチャ' }, NOW);
	const server = buildMcpServer(src, { userId, scopes, tokenId: 5, tokenName: '手元の Claude' });
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

describe('MCP の履修のツール', () => {
	it('write:courses がなければ、履修のツールは出ない', async () => {
		const { client } = await setup(['write:events']);
		const names = (await client.listTools()).tools.map((tool) => tool.name);
		expect(names).not.toContain('register_course');
	});

	it('write:courses では、履修のツールが出る。解除には、壊す操作の印が付く', async () => {
		const { client } = await setup(['write:courses']);
		const tools = (await client.listTools()).tools;
		expect(tools.map((tool) => tool.name).sort()).toEqual([
			'register_course',
			'remove_personal_slot',
			'set_personal_slot',
			'set_subject_abbreviation',
			'unregister_course',
		]);
		const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool.annotations]));
		expect(byName['unregister_course']?.destructiveHint).toBe(true);
		expect(byName['register_course']?.idempotentHint).toBe(true);
		for (const tool of tools) expect(tool.annotations?.readOnlyHint).toBe(false);
	});

	it('名前で登録でき、複数に当たれば、登録せず候補を返す', async () => {
		const { call, src, userId } = await setup(['write:courses']);

		const ok = await call('register_course', { name: '線形' });
		expect(ok.isError).toBeUndefined();
		expect(ok.structuredContent).toMatchObject({
			registered: true,
			subject: { syllabusId: '100' },
		});

		const ambiguous = await call('register_course', { name: '情報アーキテクチャ' });
		expect(ambiguous.isError).toBe(true);
		expect(ambiguous.content[0]?.text).toContain('201');
		expect(src.courses.listRegistrations(userId)).toHaveLength(1);
	});

	it('シラバスの番号だけで年度を省くか、何も指さなければ、エラーを返す', async () => {
		const { call } = await setup(['write:courses']);
		expect((await call('register_course', { syllabusId: '100' })).isError).toBe(true);
		expect((await call('register_course', {})).isError).toBe(true);
	});

	it('自分だけの曜日と時限と、略称を書き込め、解除もできる', async () => {
		const { call } = await setup(['write:courses']);
		const ref = { academicYear: 2026, syllabusId: '100' };
		await call('register_course', ref);

		const slot = await call('set_personal_slot', { ...ref, weekday: 2, period: 3, room: '363' });
		expect(slot.structuredContent).toMatchObject({
			personalSlots: [{ weekday: 2, period: 3, room: '363' }],
		});
		const removed = await call('remove_personal_slot', { ...ref, weekday: 2, period: 3 });
		expect(removed.structuredContent).toMatchObject({ personalSlots: [] });
		const abbreviation = await call('set_subject_abbreviation', { ...ref, abbreviation: '線代' });
		expect(abbreviation.structuredContent).toMatchObject({ abbreviation: '線代' });
		const unregistered = await call('unregister_course', ref);
		expect(unregistered.structuredContent).toMatchObject({ registered: false });
	});
});
