// 授業時間割 (大学が学期ごとに配る PDF) のコマを、科目と照合して、科目ごとに共有する枠にする。
// 公開シラバスの科目名は「科目名 + クラス」の形 (例: 余暇と健康Ⅱ1-EF) なので、時間割の科目名とクラスをつなげて照合する。
// 誤った科目に枠を付けると、別の授業の時間割を出してしまうので、決められない名前と、似た名前でしか合わない名前は枠にせず、人の確認へ回す。
import { matchLessonName, type MatchResult, type SubjectName } from './lesson-matching.ts';
import { SEMESTER_TERMS } from './academic-terms.ts';

/** 時間割の表の 1 つのコマ。@funmary/sources の TimetablePdfEntry と同じ形 */
export interface TimetableCell {
	/** 1 が月曜 */
	readonly weekday: number;
	readonly period: number;
	/** 科目名 (教員や注記を除いたもの) */
	readonly subject: string;
	/** クラス (例: 1-AB、1～4)。書かれていなければ null */
	readonly classes: string | null;
	readonly rooms: readonly string[];
}

export interface PlannedSlot {
	readonly subjectId: number;
	readonly weekday: number;
	readonly period: number;
	/** 部屋を , でつないだもの。書かれていなければ null */
	readonly room: string | null;
	/** 照合に使った名前 (科目名 + クラス) */
	readonly lessonName: string;
	/** manual は、管理者が手で紐付けた名前。split は、まとめて書かれたコマを分けて照合したもの */
	readonly method:
		Exclude<Extract<MatchResult, { kind: 'matched' }>['method'], 'similarity'> | 'manual' | 'split';
}

/**
 * 枠にしなかった名前。similar は、似た名前の科目 (candidateId) はあるが、同じとは言い切れないもの。
 * 科目名にクラスが付いているので (1-AB と 1-CD など)、似た名前で選ぶと、別のクラスの科目に付けてしまう
 */
export type UnmatchedName =
	| { readonly lessonName: string; readonly reason: 'unmatched' | 'ambiguous' }
	| { readonly lessonName: string; readonly reason: 'similar'; readonly candidateId: number };

export interface SlotImportPlan {
	readonly slots: readonly PlannedSlot[];
	readonly unmatched: readonly UnmatchedName[];
}

type PlannedMatch =
	| MatchResult
	| { readonly kind: 'matched'; readonly subjectId: number; readonly method: 'manual' }
	/** まとめて書かれたコマを分けて、それぞれの科目に決まったもの */
	| { readonly kind: 'split'; readonly subjectIds: readonly number[] };

const MAX_WEEKDAY = 6;
const MAX_PERIOD = 6;

/**
 * 時間割の学期 (前期か後期) に行われうる科目だけを選ぶ。前期と後期に同じ名前の科目があるので、照合の前に絞る。
 * 学期が分からなければ、すべてを返す
 */
export function subjectsInSemester<T extends { readonly term: string }>(
	subjects: readonly T[],
	semester: 'spring' | 'fall' | null,
): T[] {
	if (semester === null) return [...subjects];
	const terms: readonly string[] = SEMESTER_TERMS[semester];
	return subjects.filter((subject) => terms.includes(subject.term));
}

/** 空白を除き、NFKC で正規化する (科目名とクラスを比べるため) */
const compact = (text: string) => text.normalize('NFKC').replace(/\s+/g, '');

/** すべてが確かに (類似度でなく) 決まり、科目が重ならなければ、その科目の ID */
function allDecided(results: readonly MatchResult[]): number[] | null {
	const ids: number[] = [];
	for (const result of results) {
		if (result.kind !== 'matched' || result.method === 'similarity') return null;
		ids.push(result.subjectId);
	}
	return new Set(ids).size === ids.length ? ids : null;
}

/**
 * クラスの文字をまとめたもの (例: 2-EFJKL) を、同じ科目名と学年の科目 (2-EF と 2-JKL) で、重ならずにちょうど覆う。
 * 覆い方が 1 通りに決まるときだけ、その科目の ID を返す
 */
function coverClasses(
	subject: string,
	year: string,
	letters: string,
	subjects: readonly SubjectName[],
): number[] | null {
	const base = compact(subject) + year + '-';
	const candidates = subjects.flatMap((candidate) => {
		const name = compact(candidate.name);
		if (!name.startsWith(base)) return [];
		const own = name.slice(base.length);
		return /^[A-Z]+$/.test(own) && own !== letters && [...own].every((c) => letters.includes(c))
			? [{ id: candidate.id, letters: own }]
			: [];
	});
	const covers: number[][] = [];
	const search = (index: number, used: string, chosen: number[]) => {
		if (used.length === letters.length) {
			covers.push(chosen);
			return;
		}
		for (let i = index; i < candidates.length; i++) {
			const next = candidates[i];
			if (!next || [...next.letters].some((c) => used.includes(c))) continue;
			search(i + 1, used + next.letters, [...chosen, next.id]);
		}
	};
	search(0, '', []);
	const [only] = covers;
	return covers.length === 1 && only && only.length >= 2 ? only : null;
}

/**
 * まとめて書かれたコマを分けて照合する。例: "画像工学" の "3-JKL,4-GHI" は 画像工学3-JKL と 画像工学4-GHI、
 * "アルゴリズムとデータ構造" の "2-EFJKL" は 2-EF と 2-JKL。分けたものがすべて決まるときだけ返す
 */
function splitCombinedCell(cell: TimetableCell, subjects: readonly SubjectName[]): number[] | null {
	if (!cell.classes) return null;
	const parts = cell.classes
		.split(/[,、]/)
		.map((part) => part.trim())
		.filter(Boolean);
	if (parts.length >= 2) {
		return allDecided(parts.map((part) => matchLessonName(`${cell.subject}${part}`, subjects)));
	}
	const grouped = /^(\d)-([A-Z]{2,})$/.exec(compact(cell.classes));
	if (!grouped?.[1] || !grouped[2]) return null;
	return coverClasses(cell.subject, grouped[1], grouped[2], subjects);
}

/** 枠を付ける科目と照合の方法。決まらない (似た名前でしか合わないものを含む) なら null */
function decidedTargets(
	match: PlannedMatch,
): { subjectId: number; method: PlannedSlot['method'] }[] | null {
	if (match.kind === 'split') {
		return match.subjectIds.map((subjectId) => ({ subjectId, method: 'split' }));
	}
	if (match.kind !== 'matched' || match.method === 'similarity') return null;
	return [{ subjectId: match.subjectId, method: match.method }];
}

/**
 * resolved は、管理者が手で紐付けた名前と科目の ID (照合より優先する)。
 * 紐付けた科目が subjects (学期で絞ったもの) になければ、通常の照合に回す
 */
export function planSlotImport(
	cells: readonly TimetableCell[],
	subjects: readonly SubjectName[],
	resolved: ReadonlyMap<string, number> = new Map(),
): SlotImportPlan {
	const ids = new Set(subjects.map((subject) => subject.id));
	// 同じ名前は何度も出てくる (週に 2 コマの科目など) ので、照合の結果を使い回す
	const matches = new Map<string, PlannedMatch>();
	const slots = new Map<string, { slot: PlannedSlot; rooms: string[] }>();
	const unmatched = new Map<string, UnmatchedName>();

	for (const cell of cells) {
		if (!Number.isInteger(cell.weekday) || cell.weekday < 1 || cell.weekday > MAX_WEEKDAY) continue;
		if (!Number.isInteger(cell.period) || cell.period < 1 || cell.period > MAX_PERIOD) continue;

		const lessonName = `${cell.subject}${cell.classes ?? ''}`;
		let match = matches.get(lessonName);
		if (!match) {
			const manual = resolved.get(lessonName);
			match =
				manual !== undefined && ids.has(manual)
					? { kind: 'matched', subjectId: manual, method: 'manual' }
					: matchLessonName(lessonName, subjects);
			if (match.kind !== 'matched' || match.method === 'similarity') {
				const split = splitCombinedCell(cell, subjects);
				if (split) match = { kind: 'split', subjectIds: split };
			}
			matches.set(lessonName, match);
		}
		const targets = decidedTargets(match);
		if (!targets) {
			if (!unmatched.has(lessonName) && match.kind !== 'split') {
				unmatched.set(
					lessonName,
					match.kind === 'matched'
						? { lessonName, reason: 'similar', candidateId: match.subjectId }
						: { lessonName, reason: match.kind === 'ambiguous' ? 'ambiguous' : 'unmatched' },
				);
			}
			continue;
		}

		for (const { subjectId, method } of targets) {
			const key = `${subjectId}:${cell.weekday}:${cell.period}`;
			const existing = slots.get(key);
			if (existing) {
				for (const room of cell.rooms) {
					if (!existing.rooms.includes(room)) existing.rooms.push(room);
				}
				continue;
			}
			slots.set(key, {
				slot: {
					subjectId,
					weekday: cell.weekday,
					period: cell.period,
					room: null,
					lessonName,
					method,
				},
				rooms: [...new Set(cell.rooms)],
			});
		}
	}

	return {
		slots: [...slots.values()].map(({ slot, rooms }) => ({
			...slot,
			room: rooms.length > 0 ? rooms.join(',') : null,
		})),
		unmatched: [...unmatched.values()],
	};
}
