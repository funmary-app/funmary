// Web 版とローカル版でツールの処理を共通化する。データの読み書きには、各サーバーの FunmaryData 実装を使う。
import { z } from 'zod';
import { ambiguousMessage, FunmaryToolFailure, type CourseRef, type FunmaryData } from './data.ts';

export interface ToolContext {
	readonly data: FunmaryData;
	/** いまの時刻 (省くと「今日」を決めるのに使う)。テストで差し替える */
	readonly now: () => Date;
}

export type ToolOutput =
	| { readonly kind: 'json'; readonly value: object }
	| { readonly kind: 'error'; readonly message: string };

export interface ToolAnnotations {
	readonly readOnlyHint: boolean;
	readonly destructiveHint?: boolean;
	readonly idempotentHint?: boolean;
}

export interface ToolDefinition<Shape extends z.ZodRawShape = z.ZodRawShape> {
	readonly name: string;
	/** アクセストークンの範囲 (read:lessons など)。この範囲を持つときだけ、ツールを出す */
	readonly scope: string;
	readonly description: string;
	readonly inputSchema?: Shape;
	readonly annotations: ToolAnnotations;
	run(context: ToolContext, args: z.infer<z.ZodObject<Shape>>): Promise<ToolOutput>;
}

const json = (value: object): ToolOutput => ({ kind: 'json', value });
const error = (message: string): ToolOutput => ({ kind: 'error', message });
const orNotFound = (value: object | null): ToolOutput => json(value ?? { error: 'not_found' });

/** 日本時間の今日の日付 (YYYY-MM-DD) */
const todayJst = (now: Date) =>
	new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

const READ = { readOnlyHint: true } as const;

function define<Shape extends z.ZodRawShape>(tool: ToolDefinition<Shape>): ToolDefinition {
	return tool;
}

// ---- 読み取り ----

const readLessons = [
	define({
		name: 'get_lessons',
		scope: 'read:lessons',
		description:
			'日付 (YYYY-MM-DD、日本時間) か期間の授業を、開始と終了の時刻つきで返す (日付を省くと今日)。days に、振替授業日 (その日に行う授業の曜日)、全学の休講日、祝日が入る。status は normal (変更なし)、cancelled (休講)、makeup (補講)、roomChanged (教室変更)。room が null なら教室は分からず、roomIsTentative が true なら補講の教室を、ふだんの教室で仮に出している',
		inputSchema: { start: z.string().optional(), end: z.string().optional() },
		annotations: READ,
		async run({ data, now }, { start, end }) {
			const today = todayJst(now());
			return json(await data.timetable({ start: start ?? today, end: end ?? start ?? today }));
		},
	}),
	define({
		name: 'get_week',
		scope: 'read:lessons',
		description:
			'date (YYYY-MM-DD、日本時間。省くと今日) を含む週 (月曜から日曜) の、曜日と時限の格子。授業のない時限も cells に入る (lessons が空)。振替授業日などは note に入る',
		inputSchema: { date: z.string().optional() },
		annotations: READ,
		async run({ data, now }, { date }) {
			return json(await data.week({ date: date ?? todayJst(now()) }));
		},
	}),
	define({
		name: 'get_next_lesson',
		scope: 'read:lessons',
		description:
			'今の時刻から見た、次の授業を返す。授業中ならその授業 (inProgress が true)。休講の授業は飛ばし、14 日先まで見て、なければ next が null',
		annotations: READ,
		async run({ data }) {
			return json(await data.nextLesson());
		},
	}),
	define({
		name: 'get_periods',
		scope: 'read:lessons',
		description: '時限ごとの開始と終了の時刻 (日本時間)',
		annotations: READ,
		async run({ data }) {
			return json({ periods: await data.periods() });
		},
	}),
	define({
		name: 'list_courses',
		scope: 'read:lessons',
		description: '履修登録した科目と、その曜日 (1 が月曜から 7 が日曜) と時限',
		annotations: READ,
		async run({ data }) {
			return json({ courses: await data.courses() });
		},
	}),
	define({
		name: 'get_academic_calendar',
		scope: 'read:lessons',
		description:
			'年度の学期の期間と、その年度の祝日、全学の休講日、振替授業日を返す (年度を省くと今日が属する年度)',
		inputSchema: { year: z.number().optional() },
		annotations: READ,
		async run({ data }, { year }) {
			return json(await data.academicCalendar({ year }));
		},
	}),
	define({
		name: 'list_events',
		scope: 'read:lessons',
		description:
			'日付 (YYYY-MM-DD、日本時間) の範囲の、自分の予定と、時間割に加えたほかの人の予定 (繰り返しは回ごとに展開)。日付を省くと今日',
		inputSchema: { start: z.string().optional(), end: z.string().optional() },
		annotations: READ,
		async run({ data, now }, { start, end }) {
			const today = todayJst(now());
			return json({
				events: await data.events({ start: start ?? today, end: end ?? start ?? today }),
			});
		},
	}),
	define({
		name: 'get_event',
		scope: 'read:lessons',
		description:
			'自分の予定を 1 件、update_event に送り直せる形で返す。繰り返しや除く日も入る。ほかの人の予定は、見つからないことにする',
		inputSchema: { id: z.number().describe('予定の id (list_events の eventId)') },
		annotations: READ,
		async run({ data }, { id }) {
			const event = await data.event(id);
			return event ? json(event) : error('予定が見つかりません');
		},
	}),
	define({
		name: 'get_data_status',
		scope: 'read:lessons',
		description:
			'休講や教室の変更のデータが新しいか。stale が true のときは、反映が遅れているかもしれないので、授業の答えに添える',
		annotations: READ,
		async run({ data }) {
			return json(await data.status());
		},
	}),
	define({
		name: 'search_subjects',
		scope: 'read:lessons',
		description:
			'年度 (省けば今年度) の科目を、名前、教員、授業コードで探す。公開の科目だけを 50 件まで返す。term は spring、fall など',
		inputSchema: {
			q: z.string().max(100).optional(),
			year: z.number().optional(),
			term: z.string().optional(),
		},
		annotations: READ,
		async run({ data }, query) {
			return json(await data.searchSubjects(query));
		},
	}),
	define({
		name: 'get_subject_sessions',
		scope: 'read:lessons',
		description:
			'科目のその年度の全授業日 (時刻、教室、休講、補講、教室変更を反映)。sequence は休講を除いた通し番号で、シラバスの第 n 回とは限らない',
		inputSchema: { year: z.number(), syllabusId: z.string() },
		annotations: READ,
		async run({ data }, ref) {
			return orNotFound(await data.subjectSessions(ref));
		},
	}),
	define({
		name: 'get_subject',
		scope: 'read:lessons',
		description: '授業の詳細を返す',
		inputSchema: { year: z.number(), syllabusId: z.string() },
		annotations: READ,
		async run({ data }, ref) {
			return orNotFound(await data.subject(ref));
		},
	}),
	define({
		name: 'list_changes',
		scope: 'read:changes',
		description:
			'日付 (YYYY-MM-DD、日本時間) の範囲の休講、補講、教室変更を返す。days に、その期間の振替授業日、全学の休講日、祝日も入る',
		inputSchema: { start: z.string(), end: z.string() },
		annotations: READ,
		async run({ data }, { start, end }) {
			const { lessons, days } = (await data.timetable({ start, end })) as {
				lessons: { status: string }[];
				days: unknown[];
			};
			return json({ changes: lessons.filter((lesson) => lesson.status !== 'normal'), days });
		},
	}),
	define({
		name: 'list_notifications',
		scope: 'read:notifications',
		description:
			'通知欄 (休講、補講、教室変更などの知らせ) を、新しい順に返す。前回読んだ最大の id を afterId に渡すと、それより新しいものだけを返すので、定期的な確認に使える',
		inputSchema: { limit: z.number().optional(), afterId: z.number().optional() },
		annotations: READ,
		async run({ data }, query) {
			return json({ notifications: await data.notifications(query) });
		},
	}),
];

const readTransit = [
	define({
		name: 'list_bus_stops',
		scope: 'read:transit',
		description:
			'バスの停留所と、時刻表の版 (ダイヤ改正ごと) の一覧。highlighted が true の停留所は、既定で強調する停留所 (未来大、亀田支所前)。まだ取り込んでいなければ stops が空',
		annotations: READ,
		async run({ data }) {
			return json((await data.busStops()) ?? { error: 'not_available' });
		},
	}),
	define({
		name: 'get_bus_stop_timetable',
		scope: 'read:transit',
		description:
			'1 つの停留所の発車表。のりばと曜日の区分 (weekday は平日、holiday は土曜、日曜、祝日) ごとに分かれ、発車の time は HH:MM (日本時間、24 時以降は 24:10 のように書く)。notes に印の意味がある。generation (8 桁の版のコード) を省くと、今日に有効な版',
		inputSchema: { stopId: z.string(), generation: z.number().optional() },
		annotations: READ,
		async run({ data }, { stopId, generation }) {
			return orNotFound(await data.busStopTimetable(stopId, generation));
		},
	}),
	define({
		name: 'get_bus_leg',
		scope: 'read:transit',
		description:
			'「A から未来大へ」「未来大から A へ」のバスの発車。stopId は、未来大を通る任意の停留所 A (list_bus_stops で探す)。direction は toUniversity (A から未来大) か fromUniversity (未来大から A)。departures はその日の区分の全部、upcoming はこれからの発車。向きは、時刻表の経由と行き先の文字から決めるので、経由に書かれない停留所を通る便は、出ないことがある。day (weekday か holiday) を省くと今日の区分',
		inputSchema: {
			stopId: z.string(),
			direction: z.enum(['toUniversity', 'fromUniversity']),
			day: z.enum(['weekday', 'holiday']).optional(),
			limit: z.number().optional(),
		},
		annotations: READ,
		async run({ data }, query) {
			return orNotFound(await data.busLeg(query));
		},
	}),
	define({
		name: 'get_next_buses',
		scope: 'read:transit',
		description:
			'今から先のバスの発車を、停留所ごとに近い順に返す (土曜、日曜、祝日は休日の発車表)。stopId を省くと、強調する停留所 (未来大、亀田支所前)。limit は停留所ごとの件数 (既定 3)。minutesUntil は発車までの分',
		inputSchema: { stopId: z.string().optional(), limit: z.number().optional() },
		annotations: READ,
		async run({ data }, query) {
			return orNotFound(await data.busNext(query));
		},
	}),
];

// ---- 書き込み ----

/** 予定の項目。足すときと直すときで同じ (REST の本文と同じ形) */
const eventShape = {
	title: z.string().describe('予定の名前 (100 文字まで)'),
	location: z.string().nullable().optional().describe('場所 (100 文字まで)'),
	notes: z.string().nullable().optional().describe('メモ (1000 文字まで)'),
	startDate: z.string().describe('開始日 (YYYY-MM-DD)'),
	endDate: z
		.string()
		.nullable()
		.optional()
		.describe('終了日 (YYYY-MM-DD)。省けば開始日と同じ。数日にわたる予定は終日だけ'),
	time: z
		.discriminatedUnion('kind', [
			z.object({ kind: z.literal('allDay') }),
			z.object({
				kind: z.literal('time'),
				start: z.string().describe('HH:MM (日本時間)'),
				end: z.string().describe('HH:MM。始まりより後'),
			}),
			z.object({
				kind: z.literal('period'),
				from: z.number().describe('始まりの時限 (1 から 6)'),
				to: z.number().describe('終わりの時限 (始まり以上、6 まで)'),
			}),
		])
		.describe('終日、時刻、時限のどれか'),
	repeat: z
		.object({
			freq: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
			interval: z.number().optional().describe('間隔 (1 から 99)。省けば 1'),
			weekdays: z
				.array(z.number())
				.optional()
				.describe('weekly のとき。曜日 (月曜が 1、日曜が 7)。省けば開始日の曜日'),
			monthly: z
				.enum(['day', 'nth', 'last'])
				.optional()
				.describe('monthly のとき。day は毎月の同じ日、nth は第何曜日、last は最終週の曜日'),
			end: z
				.discriminatedUnion('kind', [
					z.object({ kind: z.literal('never') }),
					z.object({ kind: z.literal('until'), date: z.string() }),
					z.object({ kind: z.literal('count'), count: z.number() }),
				])
				.optional()
				.describe('省けば、終わりなし'),
		})
		.nullable()
		.optional()
		.describe('繰り返さないなら省くか null'),
	excludedDates: z
		.array(z.string())
		.optional()
		.describe('繰り返しから除く日 (YYYY-MM-DD。始まりの日で数える)'),
};

/** 履修のツールが、科目を指すための項目 */
const courseRefShape = {
	academicYear: z.number().optional().describe('年度 (例: 2026)。name で指すときは省ける'),
	syllabusId: z.string().optional().describe('シラバスの番号 (授業コード)'),
	name: z.string().optional().describe('科目名。syllabusId を省くときに使う'),
};

type RefArgs = {
	academicYear?: number | undefined;
	syllabusId?: string | undefined;
	name?: string | undefined;
};

/** 引数から、科目の指し方を決める。足りなければ、利用者に伝える文を返す */
function refOf(args: RefArgs): { ref: CourseRef } | { error: string } {
	if (args.syllabusId !== undefined) {
		return args.academicYear === undefined
			? { error: 'syllabusId で指すときは、academicYear (年度) も必要です' }
			: { ref: { academicYear: args.academicYear, syllabusId: args.syllabusId } };
	}
	if (args.name !== undefined) return { ref: { name: args.name, academicYear: args.academicYear } };
	return { error: '科目を、academicYear と syllabusId か、name で指してください' };
}

const slotShape = {
	weekday: z.number().describe('曜日 (1 が月曜から 6 が土曜)'),
	period: z.number().describe('時限 (1 から 6)'),
};

const writeEvents = [
	define({
		name: 'create_event',
		scope: 'write:events',
		description:
			'自分の予定を足す。公開範囲は決められず、常に非公開で足す。足した予定 (id つき) を返す。1 分あたり 20 回まで',
		inputSchema: eventShape,
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
		async run({ data }, args) {
			return json(await data.createEvent(args));
		},
	}),
	define({
		name: 'update_event',
		scope: 'write:events',
		description:
			'自分の予定を、送った内容に置き換える (送らなかった項目は、空になる)。先に get_event で今の内容を読み、変える項目だけを書き換えて送る。公開範囲は変わらない',
		inputSchema: { id: z.number().describe('予定の id'), ...eventShape },
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		async run({ data }, { id, ...rest }) {
			return json(await data.replaceEvent(id, rest));
		},
	}),
	define({
		name: 'delete_event',
		scope: 'write:events',
		description: '自分の予定を消す。元には戻せないので、消す前に、利用者に確かめる',
		inputSchema: { id: z.number().describe('予定の id') },
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		async run({ data }, { id }) {
			await data.deleteEvent(id);
			return json({ deleted: true, id });
		},
	}),
];

const writeCourses = [
	define({
		name: 'register_course',
		scope: 'write:courses',
		description:
			'履修登録する。科目は、academicYear (年度) と syllabusId (シラバスの番号) か、name (科目名。年度を省くと今年度) で指す。name が複数の科目に当たったら、登録せず候補を返すので、利用者に確かめて、番号で指し直す。登録済みなら、何も変えずに今の状態を返す',
		inputSchema: courseRefShape,
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		async run({ data }, args) {
			const target = refOf(args);
			return 'error' in target ? error(target.error) : json(await data.registerCourse(target.ref));
		},
	}),
	define({
		name: 'unregister_course',
		scope: 'write:courses',
		description:
			'履修登録を取り消す。自分だけの曜日と時限と略称は残るので、登録し直せば元に戻る。取り消す前に、利用者に確かめる',
		inputSchema: courseRefShape,
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		async run({ data }, args) {
			const target = refOf(args);
			return 'error' in target
				? error(target.error)
				: json(await data.unregisterCourse(target.ref));
		},
	}),
	define({
		name: 'set_personal_slot',
		scope: 'write:courses',
		description:
			'自分だけに使う曜日と時限を足す (同じ曜日と時限があれば、教室を上書きする)。ほかの利用者の時間割には効かない。履修登録した科目だけ。共有の枠は、ここからは書き込めない',
		inputSchema: {
			...courseRefShape,
			...slotShape,
			room: z.string().nullable().optional().describe('教室 (100 文字まで)。省くと空'),
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		async run({ data }, { weekday, period, room, ...refArgs }) {
			const target = refOf(refArgs);
			return 'error' in target
				? error(target.error)
				: json(await data.setPersonalSlot(target.ref, { weekday, period, room }));
		},
	}),
	define({
		name: 'remove_personal_slot',
		scope: 'write:courses',
		description: '自分だけの曜日と時限を消す',
		inputSchema: { ...courseRefShape, ...slotShape },
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		async run({ data }, { weekday, period, ...refArgs }) {
			const target = refOf(refArgs);
			return 'error' in target
				? error(target.error)
				: json(await data.removePersonalSlot(target.ref, { weekday, period }));
		},
	}),
	define({
		name: 'set_subject_abbreviation',
		scope: 'write:courses',
		description:
			'時間割のセルに出す、自分だけの略称を保存する (100 文字まで)。空にすると、正式名称を使う指定になる',
		inputSchema: {
			...courseRefShape,
			abbreviation: z.string().describe('略称。空文字で、正式名称に戻す'),
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		async run({ data }, { abbreviation, ...refArgs }) {
			const target = refOf(refArgs);
			return 'error' in target
				? error(target.error)
				: json(await data.setAbbreviation(target.ref, abbreviation));
		},
	}),
];

const writeNotifications = [
	define({
		name: 'mark_notification_read',
		scope: 'write:notifications',
		description: '通知を 1 件、既読にして返す',
		inputSchema: { id: z.number().describe('通知の id') },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		async run({ data }, { id }) {
			return json(await data.markNotificationRead(id));
		},
	}),
	define({
		name: 'mark_all_notifications_read',
		scope: 'write:notifications',
		description: '未読の通知をすべて既読にし、既読にした件数を返す',
		inputSchema: {},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		async run({ data }) {
			return json(await data.markAllNotificationsRead());
		},
	}),
];

/** すべてのツール。出す順は、読み取り、書き込みの順 */
export const TOOLS: readonly ToolDefinition[] = [
	...readLessons,
	...readTransit,
	...writeEvents,
	...writeCourses,
	...writeNotifications,
];

/** ツールの処理で起きた失敗を、利用者に見せる文にする。想定外の例外は、そのまま投げる */
export function failureMessage(caught: unknown): string | null {
	if (caught instanceof FunmaryToolFailure) return caught.message;
	if (typeof caught === 'object' && caught !== null && 'name' in caught) {
		const named = caught as { name: unknown; message?: unknown; code?: unknown; body?: unknown };
		if (named.name === 'FunmaryApiError' && typeof named.message === 'string') {
			// 名前が複数の科目に当たったときは、候補つきの文にする
			const body = named.body as { candidates?: unknown } | undefined;
			if (named.code === 'ambiguous' && Array.isArray(body?.candidates)) {
				return ambiguousMessage(
					named.message,
					body.candidates as { academicYear: number; syllabusId: string; name: string }[],
				);
			}
			return named.message;
		}
	}
	return null;
}
