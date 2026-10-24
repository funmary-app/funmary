// 公開 API。個人用のアクセストークンで認証する、読み取り専用の口。
// 読み取りの処理は reads/ の関数にまとめ、画面・MCP (mcp-routes.ts) と同じ関数を呼ぶ。
import type {
	AccessGrantStore,
	AccessTokenStore,
	ApiActivityStore,
	AuthStore,
	ClassChangeStore,
	NotificationKind,
	NotificationStore,
	SubjectStore,
	UserEventStore,
} from '@funmary/db';
import { BUS_DIRECTIONS, jstDateTime } from '@funmary/core';
import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { rateLimiter } from 'hono-rate-limiter';
import * as v from 'valibot';
import {
	getBusLeg,
	getBusStopTimetable,
	getNextBuses,
	listBusStops,
	MAX_NEXT_BUS_LIMIT,
	type BusSources,
} from '../reads/bus.ts';
import { listUserNotifications, type NotificationsSources } from '../reads/notifications.ts';
import {
	getDataStatus,
	listUserEventOccurrences,
	type EventSources,
	type StatusSources,
} from '../reads/public-events.ts';
import {
	getSubjectSessions,
	searchSubjects,
	type SubjectSearchSources,
} from '../reads/public-subjects.ts';
import {
	currentAcademicYear,
	getAcademicCalendar,
	getNextLesson,
	getWeekGrid,
	getPublicTimetable,
	LESSON_STATUSES,
	listPeriods,
	listUserCourses,
	type AcademicCalendarSources,
	type CourseSources,
} from '../reads/public-data.ts';
import { getSubjectDetail } from '../reads/subject-detail.ts';
import type { TimetableSources } from '../reads/user-timetable.ts';
import type { TermsGate } from '../terms-gate.ts';
import {
	createEvent,
	deleteEvent,
	getEvent,
	replaceEvent,
	type WriteActor,
} from '../writes/events.ts';
import { EventBodySchema, EventResultSchema } from '../writes/event-json.ts';
import { markAllNotificationsRead, markNotificationRead } from '../writes/notifications.ts';
import {
	AbbreviationBodySchema,
	CoursePathParam,
	CourseRefBodySchema,
	CourseStateSchema,
	courseFailureResponse,
	PersonalSlotBodySchema,
	PersonalSlotPathParam,
} from '../writes/course-json.ts';
import {
	registerCourse,
	removePersonalSlot,
	setAbbreviation,
	setPersonalSlot,
	unregisterCourse,
	type CourseWriteSources,
} from '../writes/courses.ts';
import { requireScope, v1Auth, type V1AuthVariables } from './auth.ts';

/** 1 分に 60 回まで。トークンごとに数える */
const RATE_LIMIT = { windowMs: 60 * 1000, limit: 60 };
/** 書き込みは、読み取りより厳しく、1 分に 20 回まで。暴走した AI の連打を抑える */
const WRITE_RATE_LIMIT = { windowMs: 60 * 1000, limit: 20 };

const NOTIFICATION_KINDS: readonly NotificationKind[] = [
	'cancellation',
	'makeup',
	'roomChange',
	'integration',
	'notice',
	'termStart',
];
const isNotificationKind = (value: string): value is NotificationKind =>
	(NOTIFICATION_KINDS as readonly string[]).includes(value);

export interface V1RoutesDeps
	extends
		TimetableSources,
		NotificationsSources,
		CourseSources,
		AcademicCalendarSources,
		EventSources,
		BusSources,
		StatusSources,
		SubjectSearchSources {
	/** 利用規約の再同意を求めるとき。同意していない利用者のトークンは、403 を返す */
	readonly termsGate?: TermsGate | undefined;
	readonly subjects: Pick<SubjectStore, 'findById' | 'findBySyllabus' | 'list'>;
	readonly accessGrants: Pick<AccessGrantStore, 'isGranted' | 'revokeAll'>;
	readonly classChanges: TimetableSources['classChanges'] & Pick<ClassChangeStore, 'listBySubject'>;
	readonly notifications: Pick<NotificationStore, 'list' | 'markRead' | 'markAllRead'>;
	/** 書き込みの履歴 */
	readonly activity: Pick<ApiActivityStore, 'record'>;
	readonly userEvents: Pick<
		UserEventStore,
		'listByOwner' | 'listSubscribed' | 'create' | 'update' | 'delete' | 'get'
	>;
	readonly accessTokens: Pick<AccessTokenStore, 'findOwner' | 'markUsed'>;
	readonly users: Pick<AuthStore, 'findUserById'>;
	/** 履修の書き込み (登録、解除、自分だけの曜日と時限、略称) */
	readonly courses: CourseSources['courses'] & CourseWriteSources['courses'];
	readonly personalSlots: TimetableSources['personalSlots'] & CourseWriteSources['personalSlots'];
	readonly subjectAbbreviations: CourseWriteSources['subjectAbbreviations'];
}

const DateParam = v.pipe(v.string(), v.isoDate());

const WeekQuery = v.object({ date: v.optional(DateParam) });

/** パスの ID。正の整数 */
const IdParam = v.object({
	id: v.pipe(v.string(), v.regex(/^[1-9]\d{0,9}$/), v.transform(Number)),
});

const RangeQuery = v.object({
	start: DateParam,
	end: DateParam,
});

const NotificationsQuery = v.object({
	/** カンマ区切り。省けばすべての種類 */
	kinds: v.optional(v.string()),
	since: v.optional(DateParam),
	/** 前回読んだ最大の ID。これより新しいものだけを返すので、差分の取得に使える */
	afterId: v.optional(v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(0))),
	limit: v.optional(
		v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1), v.maxValue(200)),
	),
});

const BusStopParam = v.object({ stopId: v.pipe(v.string(), v.minLength(1), v.maxLength(32)) });

const BusStopQuery = v.object({
	generation: v.optional(v.pipe(v.string(), v.regex(/^[0-9]{8}$/), v.transform(Number))),
});

const BusNextQuery = v.object({
	stopId: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(32))),
	limit: v.optional(
		v.pipe(
			v.string(),
			v.transform(Number),
			v.integer(),
			v.minValue(1),
			v.maxValue(MAX_NEXT_BUS_LIMIT),
		),
	),
});

const BusLegQuery = v.object({
	stopId: v.pipe(v.string(), v.minLength(1), v.maxLength(32)),
	direction: v.picklist(BUS_DIRECTIONS),
	day: v.optional(v.picklist(['weekday', 'holiday'])),
	limit: v.optional(
		v.pipe(
			v.string(),
			v.transform(Number),
			v.integer(),
			v.minValue(1),
			v.maxValue(MAX_NEXT_BUS_LIMIT),
		),
	),
});

const SubjectParam = v.object({
	year: v.pipe(v.string(), v.transform(Number), v.integer()),
	syllabusId: v.string(),
});

const LessonSchema = v.object({
	date: v.pipe(v.string(), v.description('YYYY-MM-DD (日本時間)')),
	period: v.pipe(v.number(), v.description('時限の番号。時刻は start と end')),
	start: v.pipe(
		v.nullable(v.string()),
		v.description('HH:MM (日本時間)。時限の時刻が不明なら null'),
	),
	end: v.nullable(v.string()),
	subjectId: v.number(),
	subjectName: v.string(),
	academicYear: v.number(),
	syllabusId: v.string(),
	room: v.pipe(v.nullable(v.string()), v.description('教室。分からなければ null')),
	roomIsTentative: v.pipe(
		v.boolean(),
		v.description('補講の教室が分からず、ふだんの教室を仮に出しているとき true'),
	),
	change: v.pipe(
		v.nullable(
			v.object({
				comment: v.nullable(v.string()),
				fromRoom: v.pipe(v.nullable(v.string()), v.description('教室変更の移動元の教室')),
				makeupPlan: v.pipe(
					v.nullable(v.picklist(['planned', 'none', 'undecided'])),
					v.description('休講コメントにある補講の予定 (あり、なし、未定)'),
				),
			}),
		),
		v.description('休講、補講、教室変更の詳細。変更がなければ null'),
	),
	status: v.pipe(
		v.picklist(LESSON_STATUSES),
		v.description('normal: 変更なし、cancelled: 休講、makeup: 補講、roomChanged: 教室変更'),
	),
});

const DaySchema = v.variant('kind', [
	v.object({
		date: v.string(),
		kind: v.literal('substitute'),
		weekday: v.pipe(v.number(), v.description('この日に行う授業の曜日。1 (月) から 7 (日)')),
	}),
	v.object({ date: v.string(), kind: v.literal('noClass'), label: v.nullable(v.string()) }),
	v.object({ date: v.string(), kind: v.literal('holiday'), name: v.string() }),
]);

const PeriodSchema = v.object({
	number: v.number(),
	start: v.pipe(v.string(), v.description('HH:MM (日本時間)')),
	end: v.string(),
});

const SlotSchema = v.object({
	weekday: v.pipe(v.number(), v.description('1 (月) から 7 (日)')),
	period: v.number(),
	room: v.nullable(v.string()),
});

const CourseSchema = v.object({
	subjectId: v.number(),
	academicYear: v.number(),
	syllabusId: v.string(),
	name: v.string(),
	teacher: v.nullable(v.string()),
	credits: v.nullable(v.number()),
	term: v.string(),
	slots: v.array(SlotSchema),
});

const TimetableSchema = v.object({
	lessons: v.array(LessonSchema),
	days: v.pipe(
		v.array(DaySchema),
		v.description('授業の日の置き換え (振替授業日)、全学の休講日、祝日'),
	),
	usesEstimatedTerms: v.pipe(v.boolean(), v.description('学期の期間に、規則で推定した値を使った')),
});

const AcademicCalendarSchema = v.object({
	academicYear: v.number(),
	terms: v.array(
		v.object({
			term: v.string(),
			start: v.string(),
			end: v.string(),
			source: v.pipe(v.string(), v.description('manual、auto、estimated')),
		}),
	),
	days: v.array(DaySchema),
});

const EventSchema = v.object({
	key: v.pipe(v.string(), v.description('回ごとに決まる ID')),
	eventId: v.number(),
	title: v.string(),
	location: v.nullable(v.string()),
	notes: v.pipe(
		v.nullable(v.string()),
		v.description('自分の予定のメモ。ほかの人の予定を加えたものは null'),
	),
	startDate: v.string(),
	endDate: v.pipe(v.string(), v.description('この回の終わりの日 (この日を含む)')),
	allDay: v.boolean(),
	start: v.pipe(
		v.nullable(v.string()),
		v.description('HH:MM (日本時間)。時限で決めた予定は、時限の時刻。終日なら null'),
	),
	end: v.nullable(v.string()),
	periods: v.pipe(
		v.nullable(v.object({ from: v.number(), to: v.number() })),
		v.description('時限で決めた予定の、時限の範囲'),
	),
	added: v.pipe(v.boolean(), v.description('ほかの人の予定を、自分の時間割に加えたもの')),
});

const StatusSchema = v.object({
	timetable: v.object({
		lastSuccessAt: v.pipe(
			v.nullable(v.string()),
			v.description('休講や教室の変更を最後に取れた日時 (ISO 8601)。一度も取れていなければ null'),
		),
		stale: v.pipe(
			v.boolean(),
			v.description('情報が古い。休講や教室の変更が、まだ反映されていないかもしれない'),
		),
	}),
});

const SubjectSummarySchema = v.object({
	academicYear: v.number(),
	syllabusId: v.string(),
	name: v.string(),
	teacher: v.nullable(v.string()),
	credits: v.nullable(v.number()),
	term: v.string(),
});

const SubjectSearchQuery = v.object({
	q: v.optional(v.pipe(v.string(), v.maxLength(100))),
	/** 省けば今日が属する年度 */
	year: v.optional(
		v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(2000), v.maxValue(2100)),
	),
	term: v.optional(v.string()),
});

const AcademicCalendarQuery = v.object({
	/** 省けば今日が属する年度 */
	year: v.optional(
		v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(2000), v.maxValue(2100)),
	),
});

const BusGenerationSchema = v.object({
	code: v.pipe(v.number(), v.description('版のコード。有効になる日の 8 桁 (例: 20261001)')),
	name: v.string(),
	current: v.pipe(v.boolean(), v.description('一覧を取った日に、使われていた版か')),
});

const BusStopsSchema = v.object({
	checkedAt: v.pipe(
		v.nullable(v.string()),
		v.description(
			'一覧を、時刻表の API に最後に確かめた日時 (ISO 8601)。まだ取り込んでいなければ null',
		),
	),
	generations: v.array(BusGenerationSchema),
	stops: v.array(
		v.object({
			id: v.string(),
			name: v.string(),
			highlighted: v.pipe(v.boolean(), v.description('既定で強調する停留所 (未来大、亀田支所前)')),
		}),
	),
});

const BusStopTimetableSchema = v.object({
	stop: v.object({ id: v.string(), name: v.string() }),
	generation: BusGenerationSchema,
	fetchedAt: v.pipe(
		v.nullable(v.string()),
		v.description('時刻表の API が事業者から、この発車表を取った日時 (ISO 8601)'),
	),
	checkedAt: v.pipe(v.string(), v.description('Funmary が時刻表の API に最後に確かめた日時')),
	platforms: v.pipe(
		v.array(
			v.object({
				platformNo: v.number(),
				platformName: v.nullable(v.string()),
				day: v.pipe(
					v.picklist(['weekday', 'holiday']),
					v.description('holiday は土曜、日曜、祝日'),
				),
				notes: v.pipe(v.array(v.string()), v.description('事業者の注意書き。印の意味もここにある')),
				departures: v.array(
					v.object({
						time: v.pipe(
							v.string(),
							v.description('HH:MM (日本時間)。24 時以降は 24:10 のように書く'),
						),
						routes: v.array(v.string()),
						via: v.nullable(v.string()),
						destination: v.nullable(v.string()),
						marks: v.array(v.string()),
					}),
				),
			}),
		),
		v.description('のりばと曜日の区分ごとの発車表'),
	),
});

const BusNextSchema = v.object({
	stops: v.array(
		v.object({
			stop: v.object({ id: v.string(), name: v.string() }),
			generation: v.nullable(BusGenerationSchema),
			checkedAt: v.nullable(v.string()),
			upcoming: v.pipe(
				v.array(
					v.object({
						serviceDate: v.pipe(
							v.string(),
							v.description(
								'その発車が属するダイヤの日。24 時以降の発車は、日付が変わったあとも前日',
							),
						),
						time: v.string(),
						minutesUntil: v.number(),
						platformNo: v.number(),
						platformName: v.nullable(v.string()),
						routes: v.array(v.string()),
						via: v.nullable(v.string()),
						destination: v.nullable(v.string()),
						marks: v.array(v.string()),
					}),
				),
				v.description('今から先の発車。発車表がまだなければ空'),
			),
			platforms: v.array(
				v.object({
					platformNo: v.number(),
					platformName: v.nullable(v.string()),
					notes: v.array(v.string()),
				}),
			),
		}),
	),
});

const WeekGridSchema = v.object({
	weekStart: v.pipe(v.string(), v.description('その週の月曜の日付 (YYYY-MM-DD)')),
	periods: v.array(v.object({ number: v.number(), start: v.string(), end: v.string() })),
	days: v.pipe(
		v.array(
			v.object({
				date: v.string(),
				weekday: v.pipe(v.number(), v.description('1 (月) から 7 (日)')),
				note: v.pipe(
					v.nullable(DaySchema),
					v.description('振替授業日、全学の休講日、祝日。なければ null'),
				),
				cells: v.pipe(
					v.array(v.object({ period: v.number(), lessons: v.array(LessonSchema) })),
					v.description('時限の順。授業のない時限も入り、lessons が空になる'),
				),
			}),
		),
		v.description('月曜から日曜の 7 日'),
	),
	usesEstimatedTerms: v.boolean(),
});

const SubjectDetailSchema = v.object({
	subject: v.object({
		id: v.number(),
		academicYear: v.number(),
		syllabusId: v.string(),
		name: v.string(),
		teacher: v.nullable(v.string()),
		credits: v.nullable(v.number()),
		term: v.string(),
		attributes: v.pipe(v.record(v.string(), v.string()), v.description('配当年次などの項目')),
		syllabus: v.pipe(
			v.record(v.string(), v.string()),
			v.description('シラバスの内容 (授業の概要、到達目標など)'),
		),
		syllabusUrl: v.nullable(v.string()),
		updatedAt: v.string(),
		source: v.picklist(['syllabus', 'user']),
		createdBy: v.nullable(v.string()),
		visibility: v.picklist(['public', 'link', 'private']),
	}),
	changes: v.pipe(
		v.array(
			v.object({
				kind: v.picklist(['cancellation', 'makeup', 'roomChange']),
				date: v.string(),
				period: v.number(),
				room: v.nullable(v.string()),
				fromRoom: v.nullable(v.string()),
				comment: v.nullable(v.string()),
				makeupPlan: v.nullable(v.picklist(['planned', 'none', 'undecided'])),
				withdrawn: v.boolean(),
			}),
		),
		v.description('休講、補講、教室変更の履歴 (新しい順)'),
	),
});

const MeSchema = v.object({
	id: v.string(),
	email: v.string(),
	scopes: v.pipe(v.array(v.string()), v.description('このトークンに許された範囲')),
});

const BusLegDepartureShape = {
	time: v.pipe(v.string(), v.description('HH:MM (日本時間)。24 時以降は 24:10 のように書く')),
	from: v.pipe(
		v.object({ id: v.string(), name: v.string() }),
		v.description(
			'この便に乗る停留所。亀田支所前から先で路線が分かれるので、選んだ停留所を通らない系統の便は、亀田支所前と未来大の間になる',
		),
	),
	to: v.pipe(v.object({ id: v.string(), name: v.string() }), v.description('この便で降りる停留所')),
	platformNo: v.number(),
	platformName: v.nullable(v.string()),
	routes: v.array(v.string()),
	via: v.nullable(v.string()),
	destination: v.nullable(v.string()),
	marks: v.array(v.string()),
};

const BusLegSchema = v.object({
	stop: v.pipe(v.object({ id: v.string(), name: v.string() }), v.description('選んだ停留所 A')),
	direction: v.picklist(BUS_DIRECTIONS),
	from: v.pipe(v.object({ id: v.string(), name: v.string() }), v.description('乗る停留所')),
	to: v.pipe(v.object({ id: v.string(), name: v.string() }), v.description('降りる停留所')),
	day: v.pipe(
		v.picklist(['weekday', 'holiday']),
		v.description('発車を並べた日の区分。holiday は土曜、日曜、祝日'),
	),
	todayDay: v.picklist(['weekday', 'holiday']),
	generation: v.nullable(BusGenerationSchema),
	checkedAt: v.nullable(v.string()),
	departures: v.pipe(
		v.array(
			v.object({
				...BusLegDepartureShape,
				arrivalTime: v.pipe(
					v.nullable(v.string()),
					v.description(
						'降りる停留所に着く時刻 (HH:MM)。到着する停留所の発車表から、同じ行き先と系統の便を結んで求めるので、結べなければ null',
					),
				),
			}),
		),
		v.description('その区分の、この向きの発車のすべて。時刻の順'),
	),
	upcoming: v.pipe(
		v.array(
			v.object({
				...BusLegDepartureShape,
				serviceDate: v.pipe(
					v.string(),
					v.description('その発車が属するダイヤの日。24 時以降の発車は、日付が変わったあとも前日'),
				),
				minutesUntil: v.number(),
			}),
		),
		v.description('これからの発車 (day が今日の区分のときだけ。違えば空)'),
	),
	notes: v.array(v.string()),
});

const NotificationSchema = v.object({
	id: v.number(),
	kind: v.string(),
	title: v.string(),
	body: v.nullable(v.string()),
	link: v.nullable(v.string()),
	createdAt: v.string(),
});

// /api/v1/openapi.json と /api/docs は認証なしで開けるので、ここには含めない (別の Hono アプリで配る)
const AUTHED_PATHS = [
	'/api/v1/lessons',
	'/api/v1/lessons/next',
	'/api/v1/timetable',
	'/api/v1/timetable/week',
	'/api/v1/periods',
	'/api/v1/courses',
	'/api/v1/courses/:year/:syllabusId',
	'/api/v1/courses/:year/:syllabusId/personal-slots',
	'/api/v1/courses/:year/:syllabusId/personal-slots/:weekday/:period',
	'/api/v1/courses/:year/:syllabusId/abbreviation',
	'/api/v1/academic-calendar',
	'/api/v1/changes',
	'/api/v1/subjects',
	'/api/v1/subjects/:year/:syllabusId',
	'/api/v1/subjects/:year/:syllabusId/sessions',
	'/api/v1/events',
	'/api/v1/events/:id',
	'/api/v1/status',
	'/api/v1/bus/stops',
	'/api/v1/bus/stops/:stopId',
	'/api/v1/bus/next',
	'/api/v1/bus/legs',
	'/api/v1/notifications',
	'/api/v1/notifications/read',
	'/api/v1/notifications/:id/read',
	'/api/v1/me',
] as const;

export function createV1Routes(deps: V1RoutesDeps): Hono<{ Variables: V1AuthVariables }> {
	const app = new Hono<{ Variables: V1AuthVariables }>();
	const auth = v1Auth({ accessTokens: deps.accessTokens, termsGate: deps.termsGate });
	const limit = rateLimiter({
		...RATE_LIMIT,
		standardHeaders: 'draft-7',
		keyGenerator: (c) => c.req.header('Authorization') ?? '',
	});
	const writeLimit = rateLimiter({
		...WRITE_RATE_LIMIT,
		standardHeaders: 'draft-7',
		keyGenerator: (c) => c.req.header('Authorization') ?? '',
	});
	for (const path of AUTHED_PATHS) {
		app.use(path, auth);
		app.use(path, limit);
		app.on(['POST', 'PUT', 'DELETE'], path, writeLimit);
	}
	const actorOf = (owner: WriteActor & { scopes?: unknown }): WriteActor => ({
		userId: owner.userId,
		tokenId: owner.tokenId,
		tokenName: owner.tokenName,
	});

	app.get(
		'/api/v1/lessons',
		requireScope('read:lessons'),
		describeRoute({
			description: '日付の範囲の授業を返す',
			responses: {
				200: {
					description: 'OK',
					content: { 'application/json': { schema: resolver(v.array(LessonSchema)) } },
				},
			},
		}),
		validator('query', RangeQuery),
		(c) => {
			const { start, end } = c.req.valid('query');
			const { userId } = c.get('tokenOwner');
			return c.json(getPublicTimetable(deps, userId, { start, end }).lessons);
		},
	);

	app.get(
		'/api/v1/lessons/next',
		requireScope('read:lessons'),
		describeRoute({
			description:
				'次の授業を返す。授業中ならその授業 (inProgress が true)。休講の授業は飛ばし、14 日先まで見て、なければ next が null',
			responses: {
				200: {
					description: 'OK',
					content: {
						'application/json': {
							schema: resolver(
								v.object({
									next: v.nullable(v.object({ ...LessonSchema.entries, inProgress: v.boolean() })),
								}),
							),
						},
					},
				},
			},
		}),
		(c) => c.json(getNextLesson(deps, c.get('tokenOwner').userId, new Date())),
	);

	app.get(
		'/api/v1/timetable',
		requireScope('read:lessons'),
		describeRoute({
			description:
				'日付の範囲の授業 (時刻つき) と、授業の日に関わる事情 (振替授業日、全学の休講日、祝日) を返す',
			responses: {
				200: {
					description: 'OK',
					content: { 'application/json': { schema: resolver(TimetableSchema) } },
				},
			},
		}),
		validator('query', RangeQuery),
		(c) => {
			const { start, end } = c.req.valid('query');
			return c.json(getPublicTimetable(deps, c.get('tokenOwner').userId, { start, end }));
		},
	);

	app.get(
		'/api/v1/timetable/week',
		requireScope('read:lessons'),
		describeRoute({
			description:
				'date (省けば今日) を含む週 (月曜から日曜) の、曜日と時限の格子。画面の週の時間割と同じ並びで、クライアントでの整形が要らない。授業のない時限も cells に入る (lessons が空)',
			responses: {
				200: {
					description: 'OK',
					content: { 'application/json': { schema: resolver(WeekGridSchema) } },
				},
			},
		}),
		validator('query', WeekQuery),
		(c) => {
			const { date } = c.req.valid('query');
			return c.json(
				getWeekGrid(deps, c.get('tokenOwner').userId, date ?? jstDateTime(new Date()).date),
			);
		},
	);

	app.get(
		'/api/v1/periods',
		requireScope('read:lessons'),
		describeRoute({
			description: '時限ごとの開始と終了の時刻 (日本時間)',
			responses: {
				200: {
					description: 'OK',
					content: { 'application/json': { schema: resolver(v.array(PeriodSchema)) } },
				},
			},
		}),
		(c) => c.json(listPeriods()),
	);

	app.get(
		'/api/v1/courses',
		requireScope('read:lessons'),
		describeRoute({
			description: '履修登録した科目と、その曜日と時限',
			responses: {
				200: {
					description: 'OK',
					content: { 'application/json': { schema: resolver(v.array(CourseSchema)) } },
				},
			},
		}),
		(c) => c.json(listUserCourses(deps, c.get('tokenOwner').userId)),
	);

	app.get(
		'/api/v1/academic-calendar',
		requireScope('read:lessons'),
		describeRoute({
			description:
				'年度の学期の期間と、その年度の祝日、全学の休講日、振替授業日 (year を省けば今日が属する年度)',
			responses: {
				200: {
					description: 'OK',
					content: { 'application/json': { schema: resolver(AcademicCalendarSchema) } },
				},
			},
		}),
		validator('query', AcademicCalendarQuery),
		(c) => {
			const { year } = c.req.valid('query');
			return c.json(getAcademicCalendar(deps, year ?? currentAcademicYear(new Date())));
		},
	);

	app.get(
		'/api/v1/changes',
		requireScope('read:changes'),
		describeRoute({
			description: '日付の範囲の休講、補講、教室変更を返す',
			responses: {
				200: {
					description: 'OK',
					content: { 'application/json': { schema: resolver(v.array(LessonSchema)) } },
				},
			},
		}),
		validator('query', RangeQuery),
		(c) => {
			const { start, end } = c.req.valid('query');
			const { userId } = c.get('tokenOwner');
			const { lessons } = getPublicTimetable(deps, userId, { start, end });
			return c.json(lessons.filter((lesson) => lesson.status !== 'normal'));
		},
	);

	app.get(
		'/api/v1/subjects/:year/:syllabusId',
		requireScope('read:lessons'),
		describeRoute({
			description: '授業の詳細を返す',
			responses: {
				200: {
					description: 'OK',
					content: { 'application/json': { schema: resolver(SubjectDetailSchema) } },
				},
				404: { description: '科目がない、または見られない' },
			},
		}),
		validator('param', SubjectParam),
		(c) => {
			const { year, syllabusId } = c.req.valid('param');
			const viewer = deps.users.findUserById(c.get('tokenOwner').userId);
			if (!viewer) return c.json({ error: 'not_found' }, 404);
			const detail = getSubjectDetail(
				deps,
				{ academicYear: year, syllabusId },
				{ id: viewer.id, email: viewer.email, role: viewer.role },
			);
			if (!detail) return c.json({ error: 'not_found' }, 404);
			return c.json(detail);
		},
	);

	app.get(
		'/api/v1/events',
		requireScope('read:lessons'),
		describeRoute({
			description:
				'日付の範囲の、自分の予定と、時間割に加えたほかの人の予定 (繰り返しは回ごとに展開する)',
			responses: {
				200: {
					description: 'OK',
					content: { 'application/json': { schema: resolver(v.array(EventSchema)) } },
				},
			},
		}),
		validator('query', RangeQuery),
		(c) => {
			const { start, end } = c.req.valid('query');
			const user = deps.users.findUserById(c.get('tokenOwner').userId);
			if (!user) return c.json({ error: 'not_found' }, 404);
			return c.json(listUserEventOccurrences(deps, user, { start, end }));
		},
	);

	app.get(
		'/api/v1/events/:id',
		requireScope('read:lessons'),
		describeRoute({
			description:
				'自分の予定を 1 件、足すときと同じ形で返す。直すときは、この形から id を除いて送り直す',
			responses: {
				200: {
					description: 'OK',
					content: { 'application/json': { schema: resolver(EventResultSchema) } },
				},
				404: { description: '予定が見つからない (ほかの人の予定も、見つからないことにする)' },
			},
		}),
		validator('param', IdParam),
		(c) => {
			const event = getEvent(deps, c.get('tokenOwner').userId, c.req.valid('param').id);
			return event
				? c.json(event)
				: c.json({ error: 'not_found', message: '予定が見つかりません' }, 404);
		},
	);

	app.post(
		'/api/v1/events',
		requireScope('write:events'),
		describeRoute({
			description:
				'自分の予定を足す。公開範囲は決められず、常に非公開で足す。書き込みは、1 分あたり 20 回まで',
			responses: {
				201: {
					description: '足した予定',
					content: { 'application/json': { schema: resolver(EventResultSchema) } },
				},
				400: { description: '入力が正しくない (message に、直し方が分かる文が入る)' },
			},
		}),
		validator('json', EventBodySchema),
		(c) => {
			const result = createEvent(
				deps,
				actorOf(c.get('tokenOwner')),
				c.req.valid('json'),
				new Date(),
			);
			return result.ok
				? c.json(result.event, 201)
				: c.json({ error: 'invalid_request', message: result.error }, 400);
		},
	);

	app.put(
		'/api/v1/events/:id',
		requireScope('write:events'),
		describeRoute({
			description:
				'自分の予定を、送った内容に置き換える (送らなかった項目は、空になる)。公開範囲は変わらない',
			responses: {
				200: {
					description: '直した予定',
					content: { 'application/json': { schema: resolver(EventResultSchema) } },
				},
				400: { description: '入力が正しくない' },
				404: { description: '予定が見つからない' },
			},
		}),
		validator('param', IdParam),
		validator('json', EventBodySchema),
		(c) => {
			const result = replaceEvent(
				deps,
				actorOf(c.get('tokenOwner')),
				c.req.valid('param').id,
				c.req.valid('json'),
				new Date(),
			);
			if (result.ok) return c.json(result.event);
			return result.kind === 'not_found'
				? c.json({ error: 'not_found', message: result.error }, 404)
				: c.json({ error: 'invalid_request', message: result.error }, 400);
		},
	);

	app.delete(
		'/api/v1/events/:id',
		requireScope('write:events'),
		describeRoute({
			description: '自分の予定を消す。元には戻せない',
			responses: { 204: { description: '消した' }, 404: { description: '予定が見つからない' } },
		}),
		validator('param', IdParam),
		(c) => {
			const result = deleteEvent(
				deps,
				actorOf(c.get('tokenOwner')),
				c.req.valid('param').id,
				new Date(),
			);
			return result.ok
				? c.body(null, 204)
				: c.json({ error: 'not_found', message: result.error }, 404);
		},
	);

	app.get(
		'/api/v1/status',
		requireScope('read:lessons'),
		describeRoute({
			description: '休講や教室の変更のデータが新しいか。古いときは、反映が遅れているかもしれない',
			responses: {
				200: {
					description: 'OK',
					content: { 'application/json': { schema: resolver(StatusSchema) } },
				},
			},
		}),
		(c) => c.json(getDataStatus(deps, new Date())),
	);

	app.get(
		'/api/v1/subjects',
		requireScope('read:lessons'),
		describeRoute({
			description:
				'年度 (省けば今年度) の科目を、名前、教員、授業コードで探す。公開の科目だけを、50 件まで返す',
			responses: {
				200: {
					description: 'OK',
					content: {
						'application/json': {
							schema: resolver(
								v.object({ subjects: v.array(SubjectSummarySchema), truncated: v.boolean() }),
							),
						},
					},
				},
			},
		}),
		validator('query', SubjectSearchQuery),
		(c) => {
			const { q, year, term } = c.req.valid('query');
			return c.json(
				searchSubjects(deps, { academicYear: year ?? currentAcademicYear(new Date()), q, term }),
			);
		},
	);

	app.get(
		'/api/v1/subjects/:year/:syllabusId/sessions',
		requireScope('read:lessons'),
		describeRoute({
			description:
				'科目のその年度の全授業日 (時刻、教室、休講、補講、教室変更を反映)。sequence は休講を除いた通し番号',
			responses: {
				200: {
					description: 'OK',
					content: {
						'application/json': {
							schema: resolver(
								v.object({
									subject: SubjectSummarySchema,
									sessions: v.array(
										v.object({ ...LessonSchema.entries, sequence: v.nullable(v.number()) }),
									),
								}),
							),
						},
					},
				},
			},
		}),
		validator('param', SubjectParam),
		(c) => {
			const { year, syllabusId } = c.req.valid('param');
			const viewer = deps.users.findUserById(c.get('tokenOwner').userId);
			if (!viewer) return c.json({ error: 'not_found' }, 404);
			const result = getSubjectSessions(
				deps,
				{ academicYear: year, syllabusId },
				{ id: viewer.id, email: viewer.email, role: viewer.role },
			);
			if (!result) return c.json({ error: 'not_found' }, 404);
			return c.json(result);
		},
	);

	app.get(
		'/api/v1/bus/stops',
		requireScope('read:transit'),
		describeRoute({
			description:
				'バスの停留所と、時刻表の版の一覧。バスの機能を使わない設定のサーバーでは 404。取り込む前は stops が空',
			responses: {
				200: {
					description: 'OK',
					content: { 'application/json': { schema: resolver(BusStopsSchema) } },
				},
			},
		}),
		(c) => {
			const result = listBusStops(deps);
			return result ? c.json(result) : c.json({ error: 'not_found' }, 404);
		},
	);

	app.get(
		'/api/v1/bus/stops/:stopId',
		requireScope('read:transit'),
		describeRoute({
			description:
				'1 つの停留所の発車表。generation (8 桁の版のコード) を省くと、今日に有効な版。取り込んでいなければ 404',
			responses: {
				200: {
					description: 'OK',
					content: { 'application/json': { schema: resolver(BusStopTimetableSchema) } },
				},
			},
		}),
		validator('param', BusStopParam),
		validator('query', BusStopQuery),
		(c) => {
			const { stopId } = c.req.valid('param');
			const { generation } = c.req.valid('query');
			const result = getBusStopTimetable(deps, new Date(), stopId, generation);
			return result ? c.json(result) : c.json({ error: 'not_found' }, 404);
		},
	);

	app.get(
		'/api/v1/bus/next',
		requireScope('read:transit'),
		describeRoute({
			description:
				'今から先のバスの発車。stopId を省くと、強調する停留所 (未来大、亀田支所前)。limit は停留所ごとの件数で、既定は 3',
			responses: {
				200: {
					description: 'OK',
					content: { 'application/json': { schema: resolver(BusNextSchema) } },
				},
			},
		}),
		validator('query', BusNextQuery),
		(c) => {
			const { stopId, limit } = c.req.valid('query');
			const result = getNextBuses(deps, new Date(), { stopId, limit });
			return result ? c.json(result) : c.json({ error: 'not_found' }, 404);
		},
	);

	app.get(
		'/api/v1/bus/legs',
		requireScope('read:transit'),
		describeRoute({
			description:
				'「A から未来大へ」「未来大から A へ」の発車。stopId は、未来大を通る任意の停留所 A。direction は toUniversity (A から未来大) か fromUniversity (未来大から A)。向きは、時刻表の経由と行き先の文字から決めるので、経由に書かれない停留所を通る便は、出ないことがある。day を省くと今日の区分',
			responses: {
				200: {
					description: 'OK',
					content: { 'application/json': { schema: resolver(BusLegSchema) } },
				},
				404: { description: '一覧にない停留所、または未来大そのもの' },
			},
		}),
		validator('query', BusLegQuery),
		(c) => {
			const { stopId, direction, day, limit } = c.req.valid('query');
			const result = getBusLeg(deps, new Date(), { stopId, direction, day, limit });
			return result ? c.json(result) : c.json({ error: 'not_found' }, 404);
		},
	);

	app.post(
		'/api/v1/courses',
		requireScope('write:courses'),
		describeRoute({
			description:
				'履修登録する。科目は、年度とシラバスの番号か、名前で指す (名前が複数の科目に当たったら、登録せず、409 で候補を返す)。登録済みなら、何も変えずに今の状態を返す。書き込みは、1 分あたり 20 回まで',
			responses: {
				200: {
					description: '登録後の状態',
					content: { 'application/json': { schema: resolver(CourseStateSchema) } },
				},
				404: {
					description: '科目が見つからない (ほかの人の非公開の科目も、見つからないことにする)',
				},
				409: { description: '名前が複数の科目に当たった (candidates に候補が入る)' },
			},
		}),
		validator('json', CourseRefBodySchema),
		(c) => {
			const result = registerCourse(
				deps,
				actorOf(c.get('tokenOwner')),
				c.req.valid('json'),
				new Date(),
			);
			if (result.ok) return c.json(result.course);
			const failure = courseFailureResponse(result);
			return c.json(failure.body, failure.status);
		},
	);

	app.delete(
		'/api/v1/courses/:year/:syllabusId',
		requireScope('write:courses'),
		describeRoute({
			description: '履修登録を取り消す。自分だけの曜日と時限と略称は残るので、登録し直せば元に戻る',
			responses: {
				200: {
					description: '取り消し後の状態',
					content: { 'application/json': { schema: resolver(CourseStateSchema) } },
				},
				404: { description: '科目がない、または履修登録していない' },
			},
		}),
		validator('param', CoursePathParam),
		(c) => {
			const { year, syllabusId } = c.req.valid('param');
			const result = unregisterCourse(
				deps,
				actorOf(c.get('tokenOwner')),
				{ academicYear: year, syllabusId },
				new Date(),
			);
			if (result.ok) return c.json(result.course);
			const failure = courseFailureResponse(result);
			return c.json(failure.body, failure.status);
		},
	);

	app.put(
		'/api/v1/courses/:year/:syllabusId/personal-slots',
		requireScope('write:courses'),
		describeRoute({
			description:
				'自分だけに使う曜日と時限を足す (同じ曜日と時限があれば、教室を上書きする)。ほかの利用者の時間割には効かない。履修登録した科目だけ。共有の枠は、ここからは書き込めない',
			responses: {
				200: {
					description: '書き込み後の状態',
					content: { 'application/json': { schema: resolver(CourseStateSchema) } },
				},
				400: { description: '曜日か時限が範囲の外' },
				409: { description: '履修登録していない科目' },
			},
		}),
		validator('param', CoursePathParam),
		validator('json', PersonalSlotBodySchema),
		(c) => {
			const { year, syllabusId } = c.req.valid('param');
			const result = setPersonalSlot(
				deps,
				actorOf(c.get('tokenOwner')),
				{ academicYear: year, syllabusId },
				c.req.valid('json'),
				new Date(),
			);
			if (result.ok) return c.json(result.course);
			const failure = courseFailureResponse(result);
			return c.json(failure.body, failure.status);
		},
	);

	app.delete(
		'/api/v1/courses/:year/:syllabusId/personal-slots/:weekday/:period',
		requireScope('write:courses'),
		describeRoute({
			description: '自分だけの曜日と時限を消す',
			responses: {
				200: {
					description: '消した後の状態',
					content: { 'application/json': { schema: resolver(CourseStateSchema) } },
				},
				404: { description: 'その曜日と時限は、登録されていない' },
			},
		}),
		validator('param', PersonalSlotPathParam),
		(c) => {
			const { year, syllabusId, weekday, period } = c.req.valid('param');
			const result = removePersonalSlot(
				deps,
				actorOf(c.get('tokenOwner')),
				{ academicYear: year, syllabusId },
				weekday,
				period,
				new Date(),
			);
			if (result.ok) return c.json(result.course);
			const failure = courseFailureResponse(result);
			return c.json(failure.body, failure.status);
		},
	);

	app.put(
		'/api/v1/courses/:year/:syllabusId/abbreviation',
		requireScope('write:courses'),
		describeRoute({
			description:
				'時間割のセルに出す、自分だけの略称を保存する。空にすると、正式名称を使う指定になる',
			responses: {
				200: {
					description: '保存後の状態',
					content: { 'application/json': { schema: resolver(CourseStateSchema) } },
				},
				400: { description: '100 文字を超えている' },
			},
		}),
		validator('param', CoursePathParam),
		validator('json', AbbreviationBodySchema),
		(c) => {
			const { year, syllabusId } = c.req.valid('param');
			const result = setAbbreviation(
				deps,
				actorOf(c.get('tokenOwner')),
				{ academicYear: year, syllabusId },
				c.req.valid('json').abbreviation,
				new Date(),
			);
			if (result.ok) return c.json(result.course);
			const failure = courseFailureResponse(result);
			return c.json(failure.body, failure.status);
		},
	);

	app.get(
		'/api/v1/notifications',
		requireScope('read:notifications'),
		describeRoute({
			description: '通知欄を返す',
			responses: {
				200: {
					description: 'OK',
					content: { 'application/json': { schema: resolver(v.array(NotificationSchema)) } },
				},
			},
		}),
		validator('query', NotificationsQuery),
		(c) => {
			const { kinds, since, afterId, limit } = c.req.valid('query');
			const { userId } = c.get('tokenOwner');
			const list = listUserNotifications(deps, userId, {
				...(kinds
					? {
							kinds: kinds
								.split(',')
								.map((kind) => kind.trim())
								.filter(isNotificationKind),
						}
					: {}),
				...(since ? { since: new Date(since) } : {}),
				...(afterId === undefined ? {} : { afterId }),
				...(limit === undefined ? {} : { limit }),
			});
			return c.json(list);
		},
	);

	app.post(
		'/api/v1/notifications/read',
		requireScope('write:notifications'),
		describeRoute({
			description: '未読の通知をすべて既読にし、既読にした件数を返す',
			responses: {
				200: {
					description: 'OK',
					content: { 'application/json': { schema: resolver(v.object({ count: v.number() })) } },
				},
			},
		}),
		(c) => {
			const { count } = markAllNotificationsRead(deps, actorOf(c.get('tokenOwner')), new Date());
			return c.json({ count });
		},
	);

	app.post(
		'/api/v1/notifications/:id/read',
		requireScope('write:notifications'),
		describeRoute({
			description: '通知を 1 件、既読にして返す',
			responses: {
				200: {
					description: 'OK',
					content: { 'application/json': { schema: resolver(NotificationSchema) } },
				},
				404: { description: '通知が見つからない' },
			},
		}),
		validator('param', IdParam),
		(c) => {
			const result = markNotificationRead(
				deps,
				actorOf(c.get('tokenOwner')),
				c.req.valid('param').id,
				new Date(),
			);
			return result.ok
				? c.json(result.notification)
				: c.json({ error: 'not_found', message: result.error }, 404);
		},
	);

	app.get(
		'/api/v1/me',
		describeRoute({
			description: 'トークンの持ち主の情報と、トークンに許された範囲を返す',
			responses: {
				200: {
					description: 'OK',
					content: { 'application/json': { schema: resolver(MeSchema) } },
				},
			},
		}),
		(c) => {
			const { userId, scopes } = c.get('tokenOwner');
			const user = deps.users.findUserById(userId);
			if (!user) return c.json({ error: 'not_found' }, 404);
			return c.json({ id: user.id, email: user.email, scopes });
		},
	);

	return app;
}
