// カレンダー購読の ICS に載せる予定。トークンの持ち主の時間割を、Hono の ICS の組み立てに渡す形にする。
import {
	buildUserTimetable,
	TERMS_REQUIRED,
	type CalendarFeed,
	type CalendarUserEvent,
	type TimetableSources,
} from '@funmary/api';
import { addDays, findPeriod, hasAcceptedTerms, jstDateTime, type UserEvent } from '@funmary/core';
import type { AuthStore, FeedTokenStore, UserEventStore } from '@funmary/db';
import { formatDayNote } from '#lib/timetable-label.ts';
import { toLessonView } from './lesson-view.ts';

/** 載せる期間。過去の授業も少し残し、履修を登録した次の学期の分まで届くようにする */
const DAYS_BEFORE = 14;
const DAYS_AFTER = 182;

export interface CalendarFeedSources extends TimetableSources {
	readonly feedTokens: Pick<FeedTokenStore, 'findOwner' | 'markUsed'>;
	/** 利用者が足した予定 */
	readonly userEvents: Pick<UserEventStore, 'listByOwner' | 'listSubscribed'>;
	/** 招待 (#215) の確認に使う、持ち主のメールアドレスを調べるため */
	readonly auth: Pick<AuthStore, 'findUserById'>;
	/** 公開 URL の origin。授業の詳細画面の URL に使う */
	readonly origin: string;
	/** 同意を求めている利用規約のバージョン。持ち主が同意するまで、購読は予定を返さない */
	readonly termsVersion: string;
}

const httpsOnly = (url: string | null) => (url?.startsWith('https://') ? url : null);

/** トークンの持ち主の予定。知らないトークン、取り消したトークン、停止した利用者なら null */
export function loadCalendarFeed(
	sources: CalendarFeedSources,
	token: string,
	now: Date,
): { feed: CalendarFeed; stamp: Date } | typeof TERMS_REQUIRED | null {
	const owner = sources.feedTokens.findOwner('calendar', token);
	if (!owner) return null;
	sources.feedTokens.markUsed(owner.id, now);
	const ownerUser = sources.auth.findUserById(owner.userId);
	// 利用規約への同意を待っている間は、予定を返さない
	if (!hasAcceptedTerms(ownerUser?.termsAcceptedVersion ?? null, sources.termsVersion)) {
		return TERMS_REQUIRED;
	}
	// トークンの発行の時点で使えていたはずのアカウントなので、通常はあるが、念のため空文字列にしておく
	const ownerEmail = ownerUser?.email ?? '';

	const today = jstDateTime(now).date;
	const timetable = buildUserTimetable(sources, owner.userId, {
		start: addDays(today, -DAYS_BEFORE),
		end: addDays(today, DAYS_AFTER),
	});
	const lessons = timetable.lessons.map((lesson) => {
		const view = toLessonView(lesson);
		const subject = sources.subjects.findById(lesson.subjectId);
		return {
			date: view.date,
			period: view.period,
			start: view.start,
			end: view.end,
			subjectKey: `${view.subjectPath.year}-${view.subjectPath.code}`,
			subjectName: view.subjectName,
			teacher: subject?.teacher ?? null,
			room: view.room,
			roomIsTentative: view.roomIsTentative,
			status: view.status,
			detailUrl: `${sources.origin}/app/subjects/${view.subjectPath.year}/${encodeURIComponent(view.subjectPath.code)}`,
			syllabusUrl: httpsOnly(subject?.syllabusUrl ?? null),
		};
	});
	// 祝日は、たいていのカレンダーアプリが自分で出すので載せない
	const days = [...timetable.notes]
		.filter(([, note]) => note.kind !== 'holiday')
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([date, note]) => ({
			date,
			summary:
				note.kind === 'substitute' ? `振替授業日 (${formatDayNote(note)})` : formatDayNote(note),
		}));
	const range = { start: addDays(today, -DAYS_BEFORE), end: addDays(today, DAYS_AFTER) };
	// 自分の予定と、ほかの人の予定のうち自分の時間割に加えたもの (公開されているものだけ)
	const own = sources.userEvents
		.listByOwner(owner.userId)
		.map((event) => ({ event, added: false }));
	const added = sources.userEvents
		.listSubscribed({ id: owner.userId, email: ownerEmail })
		.map((event) => ({ event, added: true }));
	const events = [...own, ...added]
		// 繰り返しは、いつ始まっていても入れる (カレンダーアプリが、自分で展開する)。単発は、載せる期間に掛かるものだけ
		.filter(
			({ event }) =>
				event.rrule !== null || (event.endDate >= range.start && event.startDate <= range.end),
		)
		.map(({ event, added: isAdded }) => toCalendarEvent(event, sources.origin, isAdded));
	return {
		feed: { lessons, days, events },
		// 同じ日のうちは同じ内容になり、ETag で 304 を返せるようにする
		stamp: new Date(`${today}T00:00:00+09:00`),
	};
}

/** 時限で決めた予定は、時限の時刻にする。時限が分からなければ、終日にする */
function toCalendarEvent(event: UserEvent, origin: string, added: boolean): CalendarUserEvent {
	let times: { start: string; end: string } | null = null;
	if (event.time.kind === 'time') times = { start: event.time.start, end: event.time.end };
	if (event.time.kind === 'period') {
		const first = findPeriod(event.time.from);
		const last = findPeriod(event.time.to);
		if (first && last) times = { start: first.start, end: last.end };
	}
	return {
		id: event.id,
		title: event.title,
		location: event.location,
		notes: event.notes,
		startDate: event.startDate,
		endDate: event.endDate,
		allDay: times === null,
		start: times?.start ?? null,
		end: times?.end ?? null,
		rrule: event.rrule,
		excludedDates: event.excludedDates,
		// ほかの人の予定は、直せないので、見る画面を指す
		detailUrl: `${origin}/app/events/${added ? 'shared/' : ''}${event.id}`,
	};
}
