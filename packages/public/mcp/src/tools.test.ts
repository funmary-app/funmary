/* eslint-disable @typescript-eslint/unbound-method -- vi.fn のモックを、呼ばれ方の確認に渡すだけ */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';
import { FunmaryToolFailure, type FunmaryData } from './data.ts';
import { createFunmaryMcpServer } from './server.ts';
import { TOOLS } from './tools.ts';

/** すべての口を、決まった値を返す偽物にする。呼ばれ方を見るために、vi.fn にする */
function fakeData(overrides: Partial<Record<keyof FunmaryData, unknown>> = {}) {
	const empty = { ok: true };
	const data = {
		timetable: vi.fn(() => Promise.resolve({ lessons: [], days: [] })),
		week: vi.fn(() => Promise.resolve({ weekStart: '2026-10-05' })),
		nextLesson: vi.fn(() => Promise.resolve({ next: null })),
		periods: vi.fn(() => Promise.resolve([{ number: 1, start: '09:00', end: '10:30' }])),
		courses: vi.fn(() => Promise.resolve([])),
		academicCalendar: vi.fn(() => Promise.resolve(empty)),
		events: vi.fn(() => Promise.resolve([])),
		event: vi.fn(() => Promise.resolve(null)),
		status: vi.fn(() => Promise.resolve(empty)),
		searchSubjects: vi.fn(() => Promise.resolve({ subjects: [], truncated: false })),
		subjectSessions: vi.fn(() => Promise.resolve(null)),
		subject: vi.fn(() => Promise.resolve(null)),
		notifications: vi.fn(() => Promise.resolve([])),
		busStops: vi.fn(() => Promise.resolve({ stops: [] })),
		busStopTimetable: vi.fn(() => Promise.resolve(null)),
		busLeg: vi.fn(() => Promise.resolve({ departures: [] })),
		busNext: vi.fn(() => Promise.resolve({ stops: [] })),
		createEvent: vi.fn(() => Promise.resolve({ id: 1 })),
		replaceEvent: vi.fn(() => Promise.resolve({ id: 1 })),
		deleteEvent: vi.fn(() => Promise.resolve()),
		registerCourse: vi.fn(() => Promise.resolve({ registered: true })),
		unregisterCourse: vi.fn(() => Promise.resolve({ registered: false })),
		setPersonalSlot: vi.fn(() => Promise.resolve({ personalSlots: [] })),
		removePersonalSlot: vi.fn(() => Promise.resolve({ personalSlots: [] })),
		setAbbreviation: vi.fn(() => Promise.resolve({ abbreviation: 'x' })),
		markNotificationRead: vi.fn(() => Promise.resolve({ id: 1 })),
		markAllNotificationsRead: vi.fn(() => Promise.resolve({ count: 2 })),
		...overrides,
	};
	return data as typeof data & FunmaryData;
}

async function connect(
	scopes: string[],
	data = fakeData(),
	options: { enabled?: (tool: (typeof TOOLS)[number]) => boolean } = {},
) {
	const server = createFunmaryMcpServer({
		data,
		scopes,
		now: () => new Date('2026-10-07T00:00:00Z'),
		...options,
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
	return { client, data, call };
}

describe('ツールの定義', () => {
	it('名前は重ならず、説明と必要な範囲を持つ', () => {
		const names = TOOLS.map((tool) => tool.name);
		expect(new Set(names).size).toBe(names.length);
		for (const tool of TOOLS) {
			expect(tool.description.length, tool.name).toBeGreaterThan(5);
			expect(tool.scope, tool.name).toMatch(/^(read|write):[a-z]+$/);
		}
	});

	it('readOnlyHint は読み取りツールで true、書き込みツールで false になる', () => {
		for (const tool of TOOLS) {
			expect(tool.annotations.readOnlyHint, tool.name).toBe(tool.scope.startsWith('read:'));
		}
	});
});

describe('スコープによるツールの選択', () => {
	it('範囲を持たなければ、ツールは 1 つも出ない', async () => {
		const { client } = await connect([]);
		await expect(client.listTools()).rejects.toThrow();
	});

	it('範囲に合うツールだけが出る', async () => {
		const { client } = await connect(['read:transit', 'write:notifications']);
		const names = (await client.listTools()).tools.map((tool) => tool.name).sort();
		expect(names).toEqual([
			'get_bus_leg',
			'get_bus_stop_timetable',
			'get_next_buses',
			'list_bus_stops',
			'mark_all_notifications_read',
			'mark_notification_read',
		]);
	});

	it('enabled で、範囲があっても出さないツールを決められる', async () => {
		const { client } = await connect(['read:transit', 'read:changes'], fakeData(), {
			enabled: (tool) => tool.scope !== 'read:transit',
		});
		expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(['list_changes']);
	});
});

describe('読み取り', () => {
	it('get_lessons は、日付を省くと今日 (日本時間) を渡す。終わりを省くと始まりと同じ', async () => {
		const { call, data } = await connect(['read:lessons']);
		await call('get_lessons');
		expect(data.timetable).toHaveBeenLastCalledWith({ start: '2026-10-07', end: '2026-10-07' });
		await call('get_lessons', { start: '2026-10-01' });
		expect(data.timetable).toHaveBeenLastCalledWith({ start: '2026-10-01', end: '2026-10-01' });
	});

	it('配列を返す口は、キーに包んで返す (structuredContent はオブジェクトでなければならない)', async () => {
		const { call } = await connect(['read:lessons']);
		expect((await call('get_periods')).structuredContent).toEqual({
			periods: [{ number: 1, start: '09:00', end: '10:30' }],
		});
		expect((await call('list_courses')).structuredContent).toEqual({ courses: [] });
	});

	it('list_changes は、授業のうち、変更のあるものだけを返す', async () => {
		const { call } = await connect(
			['read:changes'],
			fakeData({
				timetable: vi.fn(() =>
					Promise.resolve({
						lessons: [{ status: 'normal' }, { status: 'cancelled' }],
						days: [{ kind: 'holiday' }],
					}),
				),
			}),
		);
		const result = await call('list_changes', { start: '2026-10-01', end: '2026-10-07' });
		expect(result.structuredContent).toEqual({
			changes: [{ status: 'cancelled' }],
			days: [{ kind: 'holiday' }],
		});
	});

	it('見つからないときは、not_found を、誤りにせず返す。get_event だけは、誤りにする', async () => {
		const { call } = await connect(['read:lessons', 'read:transit']);
		expect((await call('get_subject', { year: 2026, syllabusId: 'x' })).structuredContent).toEqual({
			error: 'not_found',
		});
		expect((await call('get_bus_stop_timetable', { stopId: '1' })).isError).toBeUndefined();
		const event = await call('get_event', { id: 9 });
		expect(event.isError).toBe(true);
		expect(event.content[0]?.text).toBe('予定が見つかりません');
	});

	it('get_bus_leg は、引数をそのまま口に渡す', async () => {
		const { call, data } = await connect(['read:transit']);
		await call('get_bus_leg', { stopId: '14013', direction: 'fromUniversity', day: 'holiday' });
		expect(data.busLeg).toHaveBeenCalledWith({
			stopId: '14013',
			direction: 'fromUniversity',
			day: 'holiday',
		});
	});
});

describe('書き込み', () => {
	it('update_event は、id を分けて、残りを本文として渡す', async () => {
		const { call, data } = await connect(['write:events']);
		await call('update_event', {
			id: 3,
			title: '歯医者',
			startDate: '2026-10-20',
			time: { kind: 'allDay' },
		});
		expect(data.replaceEvent).toHaveBeenCalledWith(3, {
			title: '歯医者',
			startDate: '2026-10-20',
			time: { kind: 'allDay' },
		});
	});

	it('delete_event は、消した id を返す', async () => {
		const { call } = await connect(['write:events']);
		expect((await call('delete_event', { id: 5 })).structuredContent).toEqual({
			deleted: true,
			id: 5,
		});
	});

	it('FunmaryToolFailure は、利用者に見せる誤りの答えにする', async () => {
		const { call } = await connect(
			['write:events'],
			fakeData({
				createEvent: vi.fn(() => Promise.reject(new FunmaryToolFailure('開始日を直してください'))),
			}),
		);
		const result = await call('create_event', {
			title: 'x',
			startDate: 'bad',
			time: { kind: 'allDay' },
		});
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toBe('開始日を直してください');
	});

	it('API の誤り (FunmaryApiError) も、同じく誤りの答えにする。候補があれば、文に含める', async () => {
		const apiError = Object.assign(new Error('「情報」に当たる科目が 2 件あります'), {
			name: 'FunmaryApiError',
			code: 'ambiguous',
			body: {
				candidates: [
					{ academicYear: 2026, syllabusId: '200', name: '情報 A' },
					{ academicYear: 2026, syllabusId: '201', name: '情報 B' },
				],
			},
		});
		const { call } = await connect(
			['write:courses'],
			fakeData({ registerCourse: vi.fn(() => Promise.reject(apiError)) }),
		);
		const result = await call('register_course', { name: '情報' });
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain('2026 200 情報 A / 2026 201 情報 B');
	});

	it('想定外の例外も、握りつぶさず、誤りの答えとして返る (SDK が包む)', async () => {
		const { call } = await connect(
			['write:notifications'],
			fakeData({ markAllNotificationsRead: vi.fn(() => Promise.reject(new Error('boom'))) }),
		);
		await expect(call('mark_all_notifications_read')).resolves.toMatchObject({ isError: true });
	});

	it('科目を特定する入力がなければ、データを取得せずエラーを返す', async () => {
		const { call, data } = await connect(['write:courses']);
		expect((await call('register_course', {})).isError).toBe(true);
		expect((await call('register_course', { syllabusId: '100' })).isError).toBe(true);
		expect(data.registerCourse).not.toHaveBeenCalled();
		await call('register_course', { academicYear: 2026, syllabusId: '100' });
		expect(data.registerCourse).toHaveBeenCalledWith({ academicYear: 2026, syllabusId: '100' });
		await call('register_course', { name: '線形' });
		expect(data.registerCourse).toHaveBeenLastCalledWith({ name: '線形', academicYear: undefined });
	});

	it('set_personal_slot は、科目の指し方と、曜日、時限、教室を、分けて渡す', async () => {
		const { call, data } = await connect(['write:courses']);
		await call('set_personal_slot', {
			academicYear: 2026,
			syllabusId: '100',
			weekday: 2,
			period: 3,
			room: '363',
		});
		expect(data.setPersonalSlot).toHaveBeenCalledWith(
			{ academicYear: 2026, syllabusId: '100' },
			{ weekday: 2, period: 3, room: '363' },
		);
	});
});
