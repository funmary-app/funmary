// Discord のスラッシュコマンドの答え (#36)。呼んだ本人の時間割と休講を、本人にだけ見える本文にする。
// 連携していない人、停止した利用者には、答えの代わりに連携の案内を返す。
import {
	buildUserTimetable,
	getDataStatus,
	getBusLeg,
	listBusStops,
	getNextLesson,
	listUserEventOccurrences,
	termsRequiredMessage,
	type DayNote,
	type PublicLegUpcoming,
	type PublicEvent,
	type TimetableLesson,
} from '@funmary/api';
import {
	BUS_DIRECTIONS,
	DEFAULT_BUS_STOP_IDS,
	UNIVERSITY_STOP,
	addDays,
	findPeriod,
	hasAcceptedTerms,
	DEFAULT_PERIODS,
	jstDateTime,
	startOfWeek,
} from '@funmary/core';
import type { CalendarDate } from '@funmary/core';
import { formatDate, formatDayNote, STATUS_LABELS } from '#lib/timetable-label.ts';
import { plain } from './daily-digest.ts';
import type { Services } from './services.ts';

/** /changes が見る先の日数 */
const CHANGES_DAYS = 14;

const CHANGES_FILTER = (lesson: TimetableLesson) => lesson.status !== 'normal';

function lessonLine(lesson: TimetableLesson): string {
	const period = findPeriod(lesson.period, DEFAULT_PERIODS);
	const when = period ? `${period.start}-${period.end}` : `${lesson.period} 限`;
	const room = lesson.room ? ` (${plain(lesson.room)})` : '';
	const status = lesson.status === 'normal' ? '' : ` [${STATUS_LABELS[lesson.status]}]`;
	return `${when} ${plain(lesson.subjectName)}${room}${status}`;
}

/** 予定の 1 行。終日、時刻のどちらで決めた予定かで、時間の書き方を変える */
function eventLine(event: PublicEvent): string {
	const when = event.allDay
		? '終日'
		: event.start && event.end
			? `${event.start}-${event.end}`
			: '';
	const place = event.location ? ` (${plain(event.location)})` : '';
	return `${when ? `${when} ` : ''}${plain(event.title)}${place} [予定]`;
}

/** 次のバスの 1 行。例: 10:05 (5 分後) 55A 赤川通 → 亀田支所前 */
function busLine(bus: PublicLegUpcoming): string {
	const via = bus.via ? ` ${plain(bus.via)}` : '';
	const destination = bus.destination ? ` → ${plain(bus.destination)}` : '';
	return `${bus.time} (${bus.minutesUntil} 分後) ${plain(bus.routes.join('・'))}${via}${destination}`;
}

/** 情報が古いときに、答えの終わりへ添える注意 */
const STALE_NOTICE =
	'\n※ 休講や教室の変更のデータが、しばらく更新されていません。反映が遅れているかもしれません。';

/** 日付ごとに、授業を時限の順に並べる。授業のない日は、その事情だけを出す */
function dayBlocks(
	dates: readonly CalendarDate[],
	lessons: readonly TimetableLesson[],
	notes: ReadonlyMap<CalendarDate, DayNote>,
	include: (lesson: TimetableLesson) => boolean,
	events: readonly PublicEvent[] = [],
): string[] {
	return dates.flatMap((date) => {
		const ofDay = lessons
			.filter((lesson) => lesson.date === date && include(lesson))
			.sort((a, b) => a.period - b.period);
		const eventsOfDay = events.filter((event) => event.startDate <= date && date <= event.endDate);
		const note = notes.get(date);
		if (ofDay.length === 0 && eventsOfDay.length === 0 && !note) return [];
		const head = `**${formatDate(date)}**`;
		const body =
			ofDay.length > 0 ? ofDay.map(lessonLine) : note ? [plain(formatDayNote(note))] : [];
		return [head, ...body, ...eventsOfDay.map(eventLine)];
	});
}

function daysFrom(start: CalendarDate, count: number): CalendarDate[] {
	return Array.from({ length: count }, (_, index) => addDays(start, index));
}

/** Discord に送る、連携の案内 (本人にだけ見える) */
function linkGuidance(origin: string): string {
	return `この Discord のアカウントは、まだ Funmary に連携されていません。設定の「Discord 連携」から連携してください: ${origin}/app/settings/discord`;
}

/**
 * コマンドの答え。連携の確認から本文の作成までを行い、本人にだけ見せる文を返す。
 * 例外は握って、案内の文に置き換える (3 秒以内に応答するため、読み取りだけを同期で行う)
 */
export function answerCommand(
	services: Services,
	command: string,
	discordUserId: string,
	now: Date,
): string {
	if (!services.discord.link.enabled()) {
		return 'Discord 連携は、いまは停止しています。';
	}
	const link = services.discord.link.store.findByDiscordUserId(discordUserId);
	if (!link) return linkGuidance(services.origin);
	const user = services.auth.findUserById(link.userId);
	if (!user || user.status !== 'active')
		return 'この Funmary のアカウントは、いまは利用できません。';
	// 利用規約への同意を待っている間は、答えず、同意画面を案内する
	if (!hasAcceptedTerms(user.termsAcceptedVersion, services.termsVersion)) {
		return termsRequiredMessage(`${services.origin}/consent`);
	}

	const today = jstDateTime(now).date;
	const stale = getDataStatus(services, now).timetable.stale ? STALE_NOTICE : '';
	if (command === 'today') {
		const timetable = buildUserTimetable(services, user.id, { start: today, end: today });
		const events = listUserEventOccurrences(services, user, { start: today, end: today });
		const body = dayBlocks([today], timetable.lessons, timetable.notes, () => true, events);
		return (body.length > 0 ? body.join('\n') : '今日は、授業も休みの知らせもありません。') + stale;
	}
	if (command === 'next') {
		const { next } = getNextLesson(services, user.id, now);
		if (!next) return `これから 14 日の間に、授業の予定はありません。${stale}`;
		const label = next.inProgress ? '授業中' : '次の授業';
		return `${label}: **${formatDate(next.date)}**\n${lessonLine(next)}${stale}`;
	}
	if (command === 'week') {
		const weekStart = startOfWeek(today);
		const dates = daysFrom(weekStart, 7);
		const timetable = buildUserTimetable(services, user.id, {
			start: weekStart,
			end: addDays(weekStart, 6),
		});
		const events = listUserEventOccurrences(services, user, {
			start: weekStart,
			end: addDays(weekStart, 6),
		});
		const body = dayBlocks(dates, timetable.lessons, timetable.notes, () => true, events);
		return (body.length > 0 ? body.join('\n') : 'この週は、授業の予定がありません。') + stale;
	}
	if (command === 'changes') {
		const dates = daysFrom(today, CHANGES_DAYS);
		const timetable = buildUserTimetable(services, user.id, {
			start: today,
			end: addDays(today, CHANGES_DAYS - 1),
		});
		const body = dayBlocks(dates, timetable.lessons, timetable.notes, CHANGES_FILTER);
		return (
			(body.length > 0
				? body.join('\n')
				: `これから ${CHANGES_DAYS} 日の休講、補講、教室変更はありません。`) + stale
		);
	}
	if (command === 'bus') {
		// 既定の停留所 (亀田支所前) と未来大の間の、2 つの向きの次の発車
		const stopId = DEFAULT_BUS_STOP_IDS.find((id) => id !== UNIVERSITY_STOP.id);
		if (!listBusStops(services)) return 'このサーバーでは、バスの時刻表を使っていません。';
		const legs = BUS_DIRECTIONS.map((direction) =>
			stopId ? getBusLeg(services, now, { stopId, direction, limit: 3 }) : null,
		);
		if (legs.every((leg) => leg === null || leg.checkedAt === null)) {
			return 'バスの時刻表は、まだ取り込めていません。';
		}
		return legs
			.flatMap((leg) =>
				leg
					? [
							`**${plain(leg.from.name)} → ${plain(leg.to.name)}**`,
							...(leg.upcoming.length > 0
								? leg.upcoming.map(busLine)
								: ['この先の発車は、取り込んだ時刻表にありません。']),
						]
					: [],
			)
			.join('\n');
	}
	return 'そのコマンドには対応していません。';
}
