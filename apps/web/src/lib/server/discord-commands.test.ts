import {
	createAcademicCalendarStore,
	createAuthStore,
	createBusStore,
	createClassChangeStore,
	createCourseStore,
	createHolidayStore,
	createPersonalSlotStore,
	createSourceHealthStore,
	createSubjectStore,
	createUserEventStore,
	type Database,
} from '@funmary/db';
import { describe, expect, it } from 'vitest';
import { answerCommand } from './discord-commands.ts';
import type { Services } from './services.ts';
import { useTestDatabase } from '@funmary/db/testing';

let database: Database;
useTestDatabase('funmary-discord-commands-', (db) => (database = db));

const NOW = new Date('2026-10-07T01:00:00Z');
const TERMS_VERSION = '2026-10-03';

function services(
	options: {
		enabled?: boolean;
		linked?: { userId: string } | null;
		status?: 'active' | 'suspended';
		/** 利用者が同意した規約のバージョン。省くと、いまの版に同意済み */
		accepted?: string | null;
		/** 取得に最後に成功した日時。省くと、直前に成功したことにする */
		lastSuccessAt?: Date | null;
		/** バスの時刻表の写し。省くと、バスの機能を使わない設定 */
		bus?: ReturnType<typeof createBusStore>;
	} = {},
): Services {
	const { enabled = true, linked = null, status = 'active' } = options;
	const sourceHealth = createSourceHealthStore(database);
	const lastSuccessAt =
		options.lastSuccessAt === undefined
			? new Date(NOW.getTime() - 60 * 1000)
			: options.lastSuccessAt;
	sourceHealth.save('portal', { ...sourceHealth.load('portal'), lastSuccessAt });
	const accepted = options.accepted === undefined ? TERMS_VERSION : options.accepted;
	return {
		origin: 'https://funmary.example.com',
		termsVersion: TERMS_VERSION,
		discord: {
			link: {
				enabled: () => enabled,
				store: { findByDiscordUserId: () => (linked ? { userId: linked.userId } : null) },
			},
		},
		auth: {
			findUserById: (id: string) => ({
				id,
				email: 'a@fun.ac.jp',
				name: null,
				role: 'user',
				status,
				termsAcceptedVersion: accepted,
			}),
		},
		sourceHealth,
		userEvents: createUserEventStore(database),
		courses: createCourseStore(database),
		personalSlots: createPersonalSlotStore(database),
		subjects: createSubjectStore(database),
		classChanges: createClassChangeStore(database),
		academicCalendar: createAcademicCalendarStore(database),
		holidays: createHolidayStore(database),
		estimateHolidays: () => [],
		bus: options.bus ?? null,
	} as unknown as Services;
}

describe('answerCommand', () => {
	it('連携していない人には、連携の案内を返す', () => {
		const text = answerCommand(services(), 'today', 'discord-1', NOW);
		expect(text).toContain('まだ Funmary に連携されていません');
		expect(text).toContain('https://funmary.example.com/app/settings/discord');
	});

	it('連携の受付を止めているあいだは、その旨を返す', () => {
		const text = answerCommand(services({ enabled: false }), 'today', 'discord-1', NOW);
		expect(text).toContain('いまは停止しています');
	});

	it('停止した利用者には、答えない', () => {
		const text = answerCommand(
			services({ linked: { userId: 'u1' }, status: 'suspended' }),
			'today',
			'discord-1',
			NOW,
		);
		expect(text).toContain('利用できません');
	});

	it('利用規約に同意するまでは、どのコマンドにも答えず、同意画面を案内する', () => {
		for (const command of ['today', 'next', 'week', 'changes']) {
			const text = answerCommand(
				services({ linked: { userId: 'u1' }, accepted: null }),
				command,
				'discord-1',
				NOW,
			);
			expect(text, command).toContain('利用規約とプライバシーポリシーへの同意が必要です');
			expect(text, command).toContain('https://funmary.example.com/consent');
		}
	});

	it('古い版にしか同意していなければ、同じく止める', () => {
		const text = answerCommand(
			services({ linked: { userId: 'u1' }, accepted: '2026-09-01' }),
			'today',
			'discord-1',
			NOW,
		);
		expect(text).toContain('https://funmary.example.com/consent');
	});

	it('授業がない日の /today は、その旨を返す', () => {
		const text = answerCommand(services({ linked: { userId: 'u1' } }), 'today', 'discord-1', NOW);
		expect(text).toBe('今日は、授業も休みの知らせもありません。');
	});

	it('これから 14 日に休講などがなければ、/changes はその旨を返す', () => {
		const text = answerCommand(services({ linked: { userId: 'u1' } }), 'changes', 'discord-1', NOW);
		expect(text).toBe('これから 14 日の休講、補講、教室変更はありません。');
	});

	it('データが古いときは、答えの終わりに注意を添える', () => {
		const text = answerCommand(
			services({ linked: { userId: 'u1' }, lastSuccessAt: null }),
			'today',
			'discord-1',
			NOW,
		);
		expect(text).toContain('今日は、授業も休みの知らせもありません。');
		expect(text).toContain('しばらく更新されていません');
	});

	it('今日の予定を、/today に出す', () => {
		const ownerId = createAuthStore(database).createUser(
			{ googleSub: 'owner', email: 'a@fun.ac.jp', name: null, role: 'user' },
			NOW,
		);
		createUserEventStore(database).create(
			ownerId,
			{
				title: '架空のサークル',
				location: '架空の部室',
				notes: null,
				startDate: '2026-10-07',
				endDate: '2026-10-07',
				time: { kind: 'time', start: '18:00', end: '19:30' },
				rrule: null,
				excludedDates: [],
				visibility: 'private',
			},
			NOW,
		);

		const text = answerCommand(
			services({ linked: { userId: ownerId } }),
			'today',
			'discord-1',
			NOW,
		);

		expect(text).toContain('18:00-19:30 架空のサークル (架空の部室) [予定]');
	});

	it('授業がなければ、/next はその旨を返す', () => {
		const text = answerCommand(services({ linked: { userId: 'u1' } }), 'next', 'discord-1', NOW);
		expect(text).toBe('これから 14 日の間に、授業の予定はありません。');
	});

	describe('/bus', () => {
		const kameda = { id: '14013', name: '亀田支所前' };
		const university = { id: '14023', name: 'はこだて未来大学' };
		const generation = { code: 20261001, name: '令和8年10月1日', current: true };

		function table(
			stop: { id: string; name: string },
			departures: { time: string; destination: string; via?: string }[],
		) {
			return {
				generatedAt: NOW.toISOString(),
				generation,
				stop,
				timetables: [
					{
						platformNo: 1,
						day: 'weekday' as const,
						notes: [],
						departures: departures.map((d) => ({ routes: ['55A'], marks: [], ...d })),
					},
				],
			};
		}

		function seededBus() {
			const bus = createBusStore(database);
			bus.saveCatalog(
				{ generatedAt: NOW.toISOString(), generations: [generation], stops: [kameda, university] },
				null,
				NOW,
			);
			bus.saveTimetable(
				table(kameda, [
					{ time: '10:05', destination: '赤川', via: '赤川通・はこだて未来大学' },
					{ time: '10:20', destination: '函館駅前', via: '五稜郭' },
				]),
				null,
				NOW,
			);
			bus.saveTimetable(
				table(university, [
					{ time: '10:15', destination: '函館駅前', via: '亀田支所前・五稜郭' },
					{ time: '10:30', destination: '赤川' },
				]),
				null,
				NOW,
			);
			return bus;
		}

		it('亀田支所前と未来大の間の、2 つの向きの次の発車を、系統と行き先つきで返す', () => {
			const text = answerCommand(
				services({ linked: { userId: 'u1' }, bus: seededBus() }),
				'bus',
				'discord-1',
				NOW,
			);
			expect(text).toContain('**亀田支所前 → はこだて未来大学**');
			expect(text).toContain('10:05 (5 分後) 55A 赤川通・はこだて未来大学 → 赤川');
			expect(text).toContain('**はこだて未来大学 → 亀田支所前**');
			expect(text).toContain('10:15 (15 分後) 55A 亀田支所前・五稜郭 → 函館駅前');
			// 反対向きの便は、混ぜない
			expect(text).not.toContain('10:20');
			expect(text).not.toContain('10:30');
		});

		it('時刻表をまだ取り込んでいなければ、その旨を返す', () => {
			const text = answerCommand(
				services({ linked: { userId: 'u1' }, bus: createBusStore(database) }),
				'bus',
				'discord-1',
				NOW,
			);
			expect(text).toBe('バスの時刻表は、まだ取り込めていません。');
		});

		it('バスの機能を使わない設定では、その旨を返す', () => {
			const text = answerCommand(services({ linked: { userId: 'u1' } }), 'bus', 'discord-1', NOW);
			expect(text).toBe('このサーバーでは、バスの時刻表を使っていません。');
		});
	});

	it('知らないコマンドには、対応していないと返す', () => {
		const text = answerCommand(services({ linked: { userId: 'u1' } }), 'unknown', 'discord-1', NOW);
		expect(text).toBe('そのコマンドには対応していません。');
	});
});
