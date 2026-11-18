// 端末に出す文の組み立て (時間割、週、休講、バス)。公開 API の JSON を、表と行にする。I/O は持たない。
import type { Style } from './style.ts';
import { renderTable } from './table.ts';

export interface LessonLike {
	readonly date: string;
	readonly period: number;
	readonly start: string | null;
	readonly end: string | null;
	readonly subjectName: string;
	readonly room: string | null;
	readonly status: 'normal' | 'cancelled' | 'makeup' | 'roomChanged';
	readonly change: { readonly fromRoom: string | null } | null;
}

export interface EventLike {
	readonly title: string;
	readonly location: string | null;
	readonly allDay: boolean;
	readonly start: string | null;
	readonly end: string | null;
}

export type DayNoteLike =
	| { readonly kind: 'substitute'; readonly weekday: number }
	| { readonly kind: 'noClass'; readonly label: string | null }
	| { readonly kind: 'holiday'; readonly name: string };

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** "2026-10-07" を "10/07 (水)" にする */
export function dateLabel(date: string): string {
	const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? '';
	return `${date.slice(5, 7)}/${date.slice(8, 10)} (${weekday})`;
}

export function noteLabel(note: DayNoteLike): string {
	if (note.kind === 'holiday') return `祝日: ${note.name}`;
	if (note.kind === 'substitute') return `振替授業日: ${WEEKDAYS[note.weekday % 7] ?? ''}曜の授業`;
	return note.label ? `休講日: ${note.label}` : '休講日';
}

const STATUS_LABELS = {
	normal: '',
	cancelled: '休講',
	makeup: '補講',
	roomChanged: '教室変更',
} as const;

function statusLabel(lesson: LessonLike, style: Style): string {
	const label = STATUS_LABELS[lesson.status];
	if (label === '') return '';
	const detail =
		lesson.status === 'roomChanged' && lesson.change?.fromRoom
			? `${label} (${lesson.change.fromRoom} から)`
			: label;
	return lesson.status === 'cancelled' ? style.red(detail) : style.bold(detail);
}

const timeRange = (start: string | null, end: string | null) =>
	start && end ? `${start}-${end}` : '';

function lessonRows(lessons: readonly LessonLike[], style: Style): string[][] {
	return lessons
		.toSorted((a, b) => a.date.localeCompare(b.date) || a.period - b.period)
		.map((lesson) => [
			`${lesson.period} 限`,
			timeRange(lesson.start, lesson.end),
			lesson.subjectName,
			lesson.room ?? '',
			statusLabel(lesson, style),
		]);
}

const LESSON_HEADER = ['時限', '時刻', '科目', '教室', '状態'];

function eventLine(event: EventLike): string {
	const when = event.allDay ? '終日' : timeRange(event.start, event.end);
	return `${when ? `${when}  ` : ''}${event.title}${event.location ? ` (${event.location})` : ''}`;
}

export function formatToday(
	input: { date: string; lessons: readonly LessonLike[]; events: readonly EventLike[] },
	style: Style,
	width: number,
): string[] {
	const lines = [style.bold(dateLabel(input.date))];
	if (input.lessons.length > 0) {
		lines.push(...renderTable(LESSON_HEADER, lessonRows(input.lessons, style), width, style.dim));
	} else {
		lines.push('授業はありません');
	}
	if (input.events.length > 0) {
		lines.push('', style.bold('予定'), ...input.events.map((event) => `  ${eventLine(event)}`));
	}
	return lines;
}

export interface WeekGridLike {
	readonly days: readonly {
		readonly date: string;
		readonly weekday: number;
		readonly note: DayNoteLike | null;
		readonly cells: readonly { readonly lessons: readonly LessonLike[] }[];
	}[];
}

/** 月曜から日曜まで。土曜と日曜は、授業か事情のあるときだけ出す */
export function formatWeek(grid: WeekGridLike, style: Style, width: number): string[] {
	const lines: string[] = [];
	for (const day of grid.days) {
		const lessons = day.cells.flatMap((cell) => cell.lessons);
		if (day.weekday >= 6 && lessons.length === 0 && !day.note) continue;
		if (lines.length > 0) lines.push('');
		lines.push(
			style.bold(dateLabel(day.date)) + (day.note ? `  ${style.dim(noteLabel(day.note))}` : ''),
		);
		if (lessons.length === 0) {
			lines.push('  授業はありません');
		} else {
			lines.push(...renderTable(LESSON_HEADER, lessonRows(lessons, style), width, style.dim));
		}
	}
	return lines;
}

export function formatChanges(
	lessons: readonly LessonLike[],
	style: Style,
	width: number,
): string[] {
	if (lessons.length === 0) return ['休講、補講、教室変更はありません'];
	const rows = lessons
		.toSorted((a, b) => a.date.localeCompare(b.date) || a.period - b.period)
		.map((lesson) => [
			dateLabel(lesson.date),
			`${lesson.period} 限`,
			lesson.subjectName,
			statusLabel(lesson, style),
			lesson.room ?? '',
		]);
	return renderTable(['日付', '時限', '科目', '種類', '教室'], rows, width, style.dim);
}

export interface BusLegLike {
	readonly from: { readonly name: string };
	readonly to: { readonly name: string };
	readonly day: 'weekday' | 'holiday';
	readonly todayDay: 'weekday' | 'holiday';
	readonly checkedAt: string | null;
	readonly departures: readonly {
		readonly time: string;
		readonly arrivalTime: string | null;
		readonly from: { readonly name: string };
		readonly to: { readonly name: string };
		readonly routes: readonly string[];
		readonly destination: string | null;
	}[];
}

const minutesOf = (time: string) => {
	const [hours, minutes] = time.split(':').map(Number);
	return (hours ?? 0) * 60 + (minutes ?? 0);
};

/**
 * 「A から未来大へ」「未来大から A へ」の発車。今日の区分なら、いまから先の便を limit 件。all か、今日でない区分なら、その日の全部。
 * nowTime は日本時間の "HH:MM"
 */
export function formatBusLeg(
	leg: BusLegLike,
	options: { nowTime: string; limit: number; all: boolean },
	style: Style,
	width: number,
): string[] {
	const dayLabel = leg.day === 'weekday' ? '平日' : '休日';
	const title = style.bold(`${leg.from.name} → ${leg.to.name}`) + style.dim(` (${dayLabel})`);
	const isToday = leg.day === leg.todayDay;
	const shown =
		options.all || !isToday
			? leg.departures
			: leg.departures.filter((d) => d.time >= options.nowTime).slice(0, options.limit);
	if (shown.length === 0) {
		return [
			title,
			leg.checkedAt === null
				? '時刻表を、まだ取り込めていません'
				: isToday && !options.all
					? '今日はこのあとの便がありません'
					: '便は、取り込んだ時刻表にありません',
		];
	}
	const rows = shown.map((d) => {
		const waits =
			isToday && !options.all && d.time >= options.nowTime
				? `あと ${minutesOf(d.time) - minutesOf(options.nowTime)} 分`
				: '';
		return [
			d.time,
			d.arrivalTime ?? '',
			d.routes.join(' '),
			d.destination ? `${d.destination}行き` : '',
			`${d.from.name} - ${d.to.name}`,
			waits,
		];
	});
	return [
		title,
		...renderTable(['出発', '到着', '系統', '行き先', '区間', ''], rows, width, style.dim),
	];
}
