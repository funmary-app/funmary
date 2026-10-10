// /mcp の MCP サーバー。公開 API と同じ個人用のアクセストークンで認証し、
// 同じ reads/ の関数を呼ぶので、REST と中身が食い違わない。道具はすべて読み取り専用 (readOnlyHint)。
import { hasAcceptedTerms, jstDateTime } from '@funmary/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPTransport } from '@hono/mcp';
import { Hono } from 'hono';
import { z } from 'zod';
import { listUserNotifications, type NotificationsSources } from './reads/notifications.ts';
import {
	currentAcademicYear,
	getAcademicCalendar,
	getNextLesson,
	getPublicTimetable,
	getWeekGrid,
	listPeriods,
	listUserCourses,
} from './reads/public-data.ts';
import { getDataStatus, listUserEventOccurrences } from './reads/public-events.ts';
import { getSubjectSessions, searchSubjects } from './reads/public-subjects.ts';
import { getSubjectDetail } from './reads/subject-detail.ts';
import type { TimetableSources } from './reads/user-timetable.ts';
import { termsRequiredMessage } from './terms-gate.ts';
import type { V1RoutesDeps } from './v1/routes.ts';

/** v1/routes.ts の V1RoutesDeps と同じ形。公開 API と MCP で、同じ依存の組み立てを使い回せるようにする */
export interface McpRoutesDeps extends V1RoutesDeps {
	/** 401 で知らせる、保護されたリソースの情報の URL。OAuth で認証するクライアントが、ここから認可サーバーを見つける */
	readonly resourceMetadataUrl?: string;
	/** 公開するオリジン。あれば、サーバーの情報にアイコン (/brand/ の画像) を載せる */
	readonly origin?: string;
}

// MCP の structuredContent は、オブジェクト (record) でなければならない。配列はキーに包んで返す
const jsonText = (value: object) => ({
	content: [{ type: 'text' as const, text: JSON.stringify(value) }],
	structuredContent: value as Record<string, unknown>,
});

/** クライアントが一覧に出すアイコン。ブラウザのタブと同じ画像で、ダークの画面向けのものも添える */
function serverIcons(origin: string) {
	const base = `${origin.replace(/\/$/, '')}/brand`;
	return [
		{ src: `${base}/icon-512.png`, mimeType: 'image/png', sizes: ['512x512'] },
		{ src: `${base}/icon.svg`, mimeType: 'image/svg+xml', sizes: ['any'], theme: 'light' as const },
		{
			src: `${base}/icon-dark.svg`,
			mimeType: 'image/svg+xml',
			sizes: ['any'],
			theme: 'dark' as const,
		},
	];
}

/** MCP サーバーを組み立てる。テストでは、SDK の in-memory の接続で道具を直接確かめるのに使う */
export function buildMcpServer(
	deps: McpRoutesDeps,
	owner: { userId: string; scopes: readonly string[] },
) {
	const server = new McpServer({
		name: 'funmary',
		version: '1',
		...(deps.origin ? { icons: serverIcons(deps.origin) } : {}),
	});
	const timetableSources: TimetableSources = deps;
	const notificationsSources: NotificationsSources = deps;

	if (owner.scopes.includes('read:lessons')) {
		server.registerTool(
			'get_lessons',
			{
				description:
					'日付 (YYYY-MM-DD、日本時間) か期間の授業を、開始と終了の時刻つきで返す (日付を省くと今日)。days に、振替授業日 (その日に行う授業の曜日)、全学の休講日、祝日が入る。status は normal (変更なし)、cancelled (休講)、makeup (補講)、roomChanged (教室変更)。room が null なら教室は分からず、roomIsTentative が true なら補講の教室を、ふだんの教室で仮に出している',
				inputSchema: { start: z.string().optional(), end: z.string().optional() },
				annotations: { readOnlyHint: true },
			},
			({ start, end }) => {
				const today = jstDateTime(new Date()).date;
				return jsonText(
					getPublicTimetable(timetableSources, owner.userId, {
						start: start ?? today,
						end: end ?? start ?? today,
					}),
				);
			},
		);
		server.registerTool(
			'get_week',
			{
				description:
					'date (YYYY-MM-DD、日本時間。省くと今日) を含む週 (月曜から日曜) の、曜日と時限の格子。授業のない時限も cells に入る (lessons が空)。振替授業日などは note に入る',
				inputSchema: { date: z.string().optional() },
				annotations: { readOnlyHint: true },
			},
			({ date }) =>
				jsonText(getWeekGrid(timetableSources, owner.userId, date ?? jstDateTime(new Date()).date)),
		);
		server.registerTool(
			'get_next_lesson',
			{
				description:
					'今の時刻から見た、次の授業を返す。授業中ならその授業 (inProgress が true)。休講の授業は飛ばし、14 日先まで見て、なければ next が null',
				annotations: { readOnlyHint: true },
			},
			() => jsonText(getNextLesson(timetableSources, owner.userId, new Date())),
		);
		server.registerTool(
			'get_periods',
			{
				description: '時限ごとの開始と終了の時刻 (日本時間)',
				annotations: { readOnlyHint: true },
			},
			() => jsonText({ periods: listPeriods() }),
		);
		server.registerTool(
			'list_courses',
			{
				description: '履修登録した科目と、その曜日 (1 が月曜から 7 が日曜) と時限',
				annotations: { readOnlyHint: true },
			},
			() => jsonText({ courses: listUserCourses(timetableSources, owner.userId) }),
		);
		server.registerTool(
			'get_academic_calendar',
			{
				description:
					'年度の学期の期間と、その年度の祝日、全学の休講日、振替授業日を返す (年度を省くと今日が属する年度)',
				inputSchema: { year: z.number().optional() },
				annotations: { readOnlyHint: true },
			},
			({ year }) =>
				jsonText(getAcademicCalendar(timetableSources, year ?? currentAcademicYear(new Date()))),
		);
		server.registerTool(
			'list_events',
			{
				description:
					'日付 (YYYY-MM-DD、日本時間) の範囲の、自分の予定と、時間割に加えたほかの人の予定 (繰り返しは回ごとに展開)。日付を省くと今日',
				inputSchema: { start: z.string().optional(), end: z.string().optional() },
				annotations: { readOnlyHint: true },
			},
			({ start, end }) => {
				const user = deps.users.findUserById(owner.userId);
				if (!user) return jsonText({ error: 'not_found' });
				const today = jstDateTime(new Date()).date;
				return jsonText({
					events: listUserEventOccurrences(deps, user, {
						start: start ?? today,
						end: end ?? start ?? today,
					}),
				});
			},
		);
		server.registerTool(
			'get_data_status',
			{
				description:
					'休講や教室の変更のデータが新しいか。stale が true のときは、反映が遅れているかもしれないので、授業の答えに添える',
				annotations: { readOnlyHint: true },
			},
			() => jsonText(getDataStatus(deps, new Date())),
		);
		server.registerTool(
			'search_subjects',
			{
				description:
					'年度 (省けば今年度) の科目を、名前、教員、授業コードで探す。公開の科目だけを 50 件まで返す。term は spring、fall など',
				inputSchema: {
					q: z.string().max(100).optional(),
					year: z.number().optional(),
					term: z.string().optional(),
				},
				annotations: { readOnlyHint: true },
			},
			({ q, year, term }) =>
				jsonText(
					searchSubjects(deps, { academicYear: year ?? currentAcademicYear(new Date()), q, term }),
				),
		);
		server.registerTool(
			'get_subject_sessions',
			{
				description:
					'科目のその年度の全授業日 (時刻、教室、休講、補講、教室変更を反映)。sequence は休講を除いた通し番号で、シラバスの第 n 回とは限らない',
				inputSchema: { year: z.number(), syllabusId: z.string() },
				annotations: { readOnlyHint: true },
			},
			({ year, syllabusId }) => {
				const viewer = deps.users.findUserById(owner.userId);
				if (!viewer) return jsonText({ error: 'not_found' });
				const result = getSubjectSessions(
					deps,
					{ academicYear: year, syllabusId },
					{ id: viewer.id, email: viewer.email, role: viewer.role },
				);
				return jsonText(result ?? { error: 'not_found' });
			},
		);
		server.registerTool(
			'get_subject',
			{
				description: '授業の詳細を返す',
				inputSchema: { year: z.number(), syllabusId: z.string() },
				annotations: { readOnlyHint: true },
			},
			({ year, syllabusId }) => {
				const viewer = deps.users.findUserById(owner.userId);
				if (!viewer) return jsonText({ error: 'not_found' });
				const detail = getSubjectDetail(
					deps,
					{ academicYear: year, syllabusId },
					{ id: viewer.id, email: viewer.email, role: viewer.role },
				);
				return jsonText(detail ?? { error: 'not_found' });
			},
		);
	}

	if (owner.scopes.includes('read:changes')) {
		server.registerTool(
			'list_changes',
			{
				description:
					'日付 (YYYY-MM-DD、日本時間) の範囲の休講、補講、教室変更を返す。days に、その期間の振替授業日、全学の休講日、祝日も入る',
				inputSchema: { start: z.string(), end: z.string() },
				annotations: { readOnlyHint: true },
			},
			({ start, end }) => {
				const { lessons, days } = getPublicTimetable(timetableSources, owner.userId, {
					start,
					end,
				});
				return jsonText({
					changes: lessons.filter((lesson) => lesson.status !== 'normal'),
					days,
				});
			},
		);
	}

	if (owner.scopes.includes('read:notifications')) {
		server.registerTool(
			'list_notifications',
			{
				description:
					'通知欄 (休講、補講、教室変更などの知らせ) を、新しい順に返す。前回読んだ最大の id を afterId に渡すと、それより新しいものだけを返すので、定期的な確認に使える',
				inputSchema: { limit: z.number().optional(), afterId: z.number().optional() },
				annotations: { readOnlyHint: true },
			},
			({ limit, afterId }) =>
				jsonText({
					notifications: listUserNotifications(notificationsSources, owner.userId, {
						...(limit === undefined ? {} : { limit }),
						...(afterId === undefined ? {} : { afterId }),
					}),
				}),
		);
	}

	return server;
}

/**
 * 利用規約への同意を待っている利用者に返す MCP サーバー。データの道具は 1 つも出さず、
 * 同意が要る理由と、同意の画面の URL だけを、サーバーの説明と、唯一の道具の答えに載せる。
 * HTTP のエラーにしないのは、MCP のクライアントが、接続の失敗としか表示しないことが多いため
 */
export function buildTermsRequiredMcpServer(consentUrl: string, origin?: string) {
	const message = termsRequiredMessage(consentUrl);
	const server = new McpServer(
		{
			name: 'funmary',
			version: '1',
			...(origin ? { icons: serverIcons(origin) } : {}),
		},
		{ instructions: message },
	);
	server.registerTool(
		'terms_acceptance_required',
		{ description: message, annotations: { readOnlyHint: true } },
		() => ({ isError: true, content: [{ type: 'text' as const, text: message }] }),
	);
	return server;
}

export function createMcpRoutes(deps: McpRoutesDeps): Hono {
	const app = new Hono();
	const BEARER = /^Bearer\s+(\S+)$/;
	app.all('/mcp', async (c) => {
		const match = BEARER.exec(c.req.header('Authorization') ?? '');
		const token = match?.[1];
		const now = new Date();
		const found = token ? deps.accessTokens.findOwner(token, now) : null;
		if (!found) {
			if (deps.resourceMetadataUrl) {
				c.header('WWW-Authenticate', `Bearer resource_metadata="${deps.resourceMetadataUrl}"`);
			}
			return c.json(
				{ error: 'unauthorized', message: 'Authorization: Bearer <token> が要ります' },
				401,
			);
		}
		// トランスポートは、対応していない版に 404 の例外を投げる。仕様の 400 で、対応する版を知らせて断る
		const requested = c.req.header('mcp-protocol-version');
		if (requested !== undefined && !SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
			return c.json(
				{
					jsonrpc: '2.0',
					error: {
						code: -32000,
						message: `Bad Request: Unsupported protocol version (supported versions: ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')})`,
					},
					id: null,
				},
				400,
			);
		}
		deps.accessTokens.markUsed(found.id, now);
		const waitingForTerms =
			deps.termsGate !== undefined &&
			!hasAcceptedTerms(found.termsAcceptedVersion, deps.termsGate.version);
		const server =
			waitingForTerms && deps.termsGate
				? buildTermsRequiredMcpServer(deps.termsGate.consentUrl, deps.origin)
				: buildMcpServer(deps, { userId: found.userId, scopes: found.scopes });
		const transport = new StreamableHTTPTransport();
		await server.connect(transport);
		return transport.handleRequest(c);
	});
	return app;
}
