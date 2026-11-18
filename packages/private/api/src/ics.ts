// カレンダー購読の ICS を組み立てる。入力は保存済みのデータから作った授業と日の予定で、ここでは形を整えるだけ。
import ICAL from 'ical.js';

// ical.js は、折り返した行の先頭の空白を数えずに 75 オクテットで切るので、続きの行が 76 オクテットになる。
// RFC 5545 の上限 (75 オクテット) に収めるため、1 つ短くする
ICAL.foldLength = 74;

/** 1 回分の授業。日付は YYYY-MM-DD、時刻は日本時間の HH:MM */
export interface CalendarLesson {
	readonly date: string;
	readonly period: number;
	/** 時限の時刻。分からない時限なら null で、終日の予定にする */
	readonly start: string | null;
	readonly end: string | null;
	/**
	 * 科目を見分ける値 (例: 2026-100201。年度とシラバスの番号)。予定の UID に使う。
	 * DB の ID は作り直すと変わるので使わない (変わると、購読しているカレンダーの予定が作り直される)
	 */
	readonly subjectKey: string;
	readonly subjectName: string;
	readonly teacher: string | null;
	readonly room: string | null;
	/** 補講の教室が分からず、ふだんの教室を仮に出しているとき true */
	readonly roomIsTentative: boolean;
	readonly status: 'normal' | 'cancelled' | 'makeup' | 'roomChanged';
	readonly detailUrl: string;
	readonly syllabusUrl: string | null;
}

/** 振替授業日や全学の休講日など、終日の予定 */
export interface CalendarDayEvent {
	readonly date: string;
	readonly summary: string;
}

/** 利用者が足した予定 (Issue #144)。繰り返しは、展開せずに RRULE のまま書く */
export interface CalendarUserEvent {
	/** DB の予定の ID。UID に使う (予定を直しても、UID は変わらない) */
	readonly id: number;
	readonly title: string;
	readonly location: string | null;
	readonly notes: string | null;
	/** 始まりの日と、終わりの日 (この日を含む)。YYYY-MM-DD */
	readonly startDate: string;
	readonly endDate: string;
	readonly allDay: boolean;
	/** 終日でないときの、開始と終了の時刻 (日本時間の HH:MM。同じ日の中) */
	readonly start: string | null;
	readonly end: string | null;
	/** RFC 5545 の RRULE の値。繰り返さないなら null */
	readonly rrule: string | null;
	/** 繰り返しから除く日 (始まりの日で数える) */
	readonly excludedDates: readonly string[];
	readonly detailUrl: string;
}

export interface CalendarFeed {
	readonly lessons: readonly CalendarLesson[];
	readonly days: readonly CalendarDayEvent[];
	/** 省くと、なし */
	readonly events?: readonly CalendarUserEvent[];
}

export interface IcsOptions {
	/** UID の @ の後ろ。公開の URL のホスト名 */
	readonly uidDomain: string;
	/** DTSTAMP。同じ入力で同じ内容になるよう、呼ぶ側で決める */
	readonly stamp: Date;
}

const PREFIX: Record<CalendarLesson['status'], string> = {
	normal: '',
	cancelled: '[休講] ',
	makeup: '[補講] ',
	roomChanged: '[教室変更] ',
};

export function buildIcs(feed: CalendarFeed, options: IcsOptions): string {
	const calendar = new ICAL.Component('vcalendar');
	calendar.addPropertyWithValue('version', '2.0');
	calendar.addPropertyWithValue('prodid', '-//Funmary//Timetable//JA');
	calendar.addPropertyWithValue('calscale', 'GREGORIAN');
	calendar.addPropertyWithValue('method', 'PUBLISH');
	calendar.addPropertyWithValue('x-wr-calname', 'Funmary の時間割');
	calendar.addPropertyWithValue('x-wr-timezone', 'Asia/Tokyo');
	// 対応するアプリ (Apple のカレンダーなど) に、取りに来る間隔の目安を伝える。VALUE=DURATION は ical.js が付ける
	calendar.addPropertyWithValue('refresh-interval', ICAL.Duration.fromString('PT1H'));
	calendar.addPropertyWithValue('x-published-ttl', 'PT1H');

	const stamp = ICAL.Time.fromJSDate(options.stamp, true);
	// 時刻のある予定は、日本時間 (TZID) で書く。繰り返しの曜日が、UTC にずれて数えられないようにするため
	if (feed.events?.some((event) => !event.allDay)) calendar.addSubcomponent(tokyoTimezone());
	for (const lesson of feed.lessons) {
		calendar.addSubcomponent(lessonEvent(lesson, stamp, options.uidDomain));
	}
	for (const day of feed.days) {
		const vevent = new ICAL.Component('vevent');
		vevent.addPropertyWithValue('uid', `${day.date}-day@${options.uidDomain}`);
		vevent.addPropertyWithValue('dtstamp', stamp);
		setAllDay(vevent, day.date);
		vevent.addPropertyWithValue('summary', day.summary);
		vevent.addPropertyWithValue('transp', 'TRANSPARENT');
		calendar.addSubcomponent(vevent);
	}
	for (const event of feed.events ?? []) {
		calendar.addSubcomponent(userEvent(event, stamp, options.uidDomain));
	}
	return calendar.toString() + '\r\n';
}

const TOKYO = 'Asia/Tokyo';

/** 日本には夏時間がないので、UTC+9 の固定 */
function tokyoTimezone(): ICAL.Component {
	return new ICAL.Component(
		ICAL.parse(
			[
				'BEGIN:VTIMEZONE',
				`TZID:${TOKYO}`,
				'BEGIN:STANDARD',
				'DTSTART:19700101T000000',
				'TZOFFSETFROM:+0900',
				'TZOFFSETTO:+0900',
				'TZNAME:JST',
				'END:STANDARD',
				'END:VTIMEZONE',
			].join('\r\n'),
		) as unknown[],
	);
}

/** 日本時間の日時の、TZID 付きの項目 (例: DTSTART;TZID=Asia/Tokyo:20261102T170000) */
function zonedProperty(name: string, date: string, time: string): ICAL.Property {
	const property = new ICAL.Property(name);
	property.setParameter('tzid', TOKYO);
	property.setValue(ICAL.Time.fromDateTimeString(`${date}T${time}:00`));
	return property;
}

function userEvent(event: CalendarUserEvent, stamp: ICAL.Time, uidDomain: string) {
	const vevent = new ICAL.Component('vevent');
	vevent.addPropertyWithValue('uid', `user-event-${event.id}@${uidDomain}`);
	vevent.addPropertyWithValue('dtstamp', stamp);
	const timed = !event.allDay && event.start !== null && event.end !== null;
	if (timed) {
		vevent.addProperty(zonedProperty('dtstart', event.startDate, event.start ?? '00:00'));
		vevent.addProperty(zonedProperty('dtend', event.startDate, event.end ?? '00:00'));
	} else {
		const start = ICAL.Time.fromDateString(event.startDate);
		const end = ICAL.Time.fromDateString(event.endDate);
		end.adjust(1, 0, 0, 0);
		vevent.addPropertyWithValue('dtstart', start);
		vevent.addPropertyWithValue('dtend', end);
	}
	vevent.addPropertyWithValue('summary', event.title);
	if (event.location) vevent.addPropertyWithValue('location', event.location);
	vevent.addPropertyWithValue(
		'description',
		[...(event.notes ? [event.notes] : []), `詳細: ${event.detailUrl}`].join('\n'),
	);
	vevent.addPropertyWithValue('url', event.detailUrl);
	if (event.rrule) {
		vevent.addPropertyWithValue('rrule', ICAL.Recur.fromString(rruleForIcs(event.rrule, !timed)));
		for (const date of event.excludedDates) {
			if (timed) vevent.addProperty(zonedProperty('exdate', date, event.start ?? '00:00'));
			else vevent.addPropertyWithValue('exdate', ICAL.Time.fromDateString(date));
		}
	}
	return vevent;
}

/**
 * RRULE の UNTIL は、DTSTART と同じ種類でなければならない (RFC 5545)。画面で選んだ日付 (YYYYMMDD) は、時刻の予定では、日本時間のその日の終わり (23:59:59+09:00) を、UTC (同じ日の 14:59:59Z) で書く
 */
function rruleForIcs(rrule: string, allDay: boolean): string {
	if (allDay) return rrule;
	return rrule.replace(/(^|;)UNTIL=(\d{8})(?=;|$)/, '$1UNTIL=$2T145959Z');
}

function lessonEvent(lesson: CalendarLesson, stamp: ICAL.Time, uidDomain: string) {
	const vevent = new ICAL.Component('vevent');
	vevent.addPropertyWithValue(
		'uid',
		`${lesson.date}-${lesson.period}-${lesson.subjectKey}@${uidDomain}`,
	);
	vevent.addPropertyWithValue('dtstamp', stamp);
	if (lesson.start && lesson.end) {
		vevent.addPropertyWithValue('dtstart', jstTime(lesson.date, lesson.start));
		vevent.addPropertyWithValue('dtend', jstTime(lesson.date, lesson.end));
		vevent.addPropertyWithValue('summary', PREFIX[lesson.status] + lesson.subjectName);
	} else {
		setAllDay(vevent, lesson.date);
		vevent.addPropertyWithValue(
			'summary',
			`${PREFIX[lesson.status]}${lesson.subjectName} (${lesson.period} 限)`,
		);
	}
	if (lesson.room) vevent.addPropertyWithValue('location', lesson.room);
	vevent.addPropertyWithValue('description', description(lesson));
	vevent.addPropertyWithValue('url', lesson.detailUrl);
	// STATUS を出さないアプリもあるので、休講はタイトルの [休講] でも分かるようにしてある
	vevent.addPropertyWithValue('status', lesson.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED');
	if (lesson.status === 'cancelled') vevent.addPropertyWithValue('transp', 'TRANSPARENT');
	return vevent;
}

function description(lesson: CalendarLesson): string {
	const lines = [`${lesson.period} 限`];
	if (lesson.teacher) lines.push(`教員: ${lesson.teacher}`);
	if (lesson.roomIsTentative) {
		lines.push('補講の教室が分からないので、ふだんの教室を出しています。');
	}
	lines.push(`詳細: ${lesson.detailUrl}`);
	if (lesson.syllabusUrl) lines.push(`シラバス: ${lesson.syllabusUrl}`);
	return lines.join('\n');
}

/** 日本時間の日時を、UTC の時刻にする (VTIMEZONE を持たずに済む) */
function jstTime(date: string, time: string): ICAL.Time {
	return ICAL.Time.fromJSDate(new Date(`${date}T${time}:00+09:00`), true);
}

function setAllDay(vevent: ICAL.Component, date: string) {
	const start = ICAL.Time.fromDateString(date);
	const end = start.clone();
	end.adjust(1, 0, 0, 0);
	vevent.addPropertyWithValue('dtstart', start);
	vevent.addPropertyWithValue('dtend', end);
}
