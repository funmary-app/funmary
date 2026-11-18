// MCP ツールのデータアクセスを定義する。サーバーの /mcp は DB、手元で動く MCP (stdio) は @funmary/client 経由で公開 API を使う。
// 戻り値は公開 API の JSON と同じ形で、データが見つからなければ null を返す。書き込みに失敗すると FunmaryToolFailure を投げる。

/** 公開 API と同じ形の JSON */
export type Json = object;

export interface DateRange {
	readonly start: string;
	readonly end: string;
}

/** 科目の指し方。年度とシラバスの番号か、名前 (年度を省くと、今年度) */
export type CourseRef =
	| { readonly academicYear: number; readonly syllabusId: string }
	| { readonly name: string; readonly academicYear?: number | undefined };

export interface FunmaryData {
	timetable(range: DateRange): Promise<Json>;
	week(query: { date?: string | undefined }): Promise<Json>;
	nextLesson(): Promise<Json>;
	periods(): Promise<readonly Json[]>;
	courses(): Promise<readonly Json[]>;
	academicCalendar(query: { year?: number | undefined }): Promise<Json>;
	events(range: DateRange): Promise<readonly Json[]>;
	event(id: number): Promise<Json | null>;
	status(): Promise<Json>;
	searchSubjects(query: {
		q?: string | undefined;
		year?: number | undefined;
		term?: string | undefined;
	}): Promise<Json>;
	subjectSessions(ref: { year: number; syllabusId: string }): Promise<Json | null>;
	subject(ref: { year: number; syllabusId: string }): Promise<Json | null>;
	notifications(query: {
		limit?: number | undefined;
		afterId?: number | undefined;
	}): Promise<readonly Json[]>;
	busStops(): Promise<Json | null>;
	busStopTimetable(stopId: string, generation?: number): Promise<Json | null>;
	busLeg(query: {
		stopId: string;
		direction: 'toUniversity' | 'fromUniversity';
		day?: 'weekday' | 'holiday' | undefined;
		limit?: number | undefined;
	}): Promise<Json | null>;
	busNext(query: { stopId?: string | undefined; limit?: number | undefined }): Promise<Json | null>;

	createEvent(body: unknown): Promise<Json>;
	replaceEvent(id: number, body: unknown): Promise<Json>;
	deleteEvent(id: number): Promise<void>;
	registerCourse(ref: CourseRef): Promise<Json>;
	unregisterCourse(ref: CourseRef): Promise<Json>;
	setPersonalSlot(
		ref: CourseRef,
		slot: { weekday: number; period: number; room?: string | null | undefined },
	): Promise<Json>;
	removePersonalSlot(ref: CourseRef, slot: { weekday: number; period: number }): Promise<Json>;
	setAbbreviation(ref: CourseRef, abbreviation: string): Promise<Json>;
	markNotificationRead(id: number): Promise<Json>;
	markAllNotificationsRead(): Promise<Json>;
}

/** 書き込みや読み取りの失敗。文は、そのまま、利用者 (と AI) に見せる */
export class FunmaryToolFailure extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'FunmaryToolFailure';
	}
}

/** 名前が複数の科目に一致したときに、候補を表示するメッセージを作る */
export function ambiguousMessage(
	error: string,
	candidates: readonly { academicYear: number; syllabusId: string; name: string }[],
): string {
	return `${error}: ${candidates.map((c) => `${c.academicYear} ${c.syllabusId} ${c.name}`).join(' / ')}`;
}
