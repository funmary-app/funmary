// 履修まわりの入力の検査。画面のフォームと、公開 API (JSON) の両方が、この検査を通る。
// 入力は信用しないので、型は unknown で受け、数字の文字列 (フォームの値) も数として読む。
import { DEFAULT_PERIODS } from './periods.ts';

/** 教室名の文字数の上限。ポータルの時間割の取り込みと揃える */
const MAX_ROOM_LENGTH = 100;
const MAX_ABBREVIATION_LENGTH = 100;

export interface SlotInput {
	/** 1 (月) から 6 (土) */
	readonly weekday: number;
	readonly period: number;
	readonly room: string | null;
}

export type SlotInputResult =
	{ readonly ok: true; readonly value: SlotInput } | { readonly ok: false; readonly error: string };

/** 整数、または半角数字だけの文字列を、整数として読む。それ以外は null */
function readInteger(value: unknown): number | null {
	if (typeof value === 'number') return Number.isInteger(value) ? value : null;
	if (typeof value === 'string' && /^\d{1,2}$/.test(value)) return Number(value);
	return null;
}

/** 曜日、時限、教室を検査する。科目は別に決まっているときに使う */
export function parseSlotInput(input: {
	readonly weekday: unknown;
	readonly period: unknown;
	readonly room?: unknown;
}): SlotInputResult {
	const weekday = readInteger(input.weekday);
	if (weekday === null || weekday < 1 || weekday > 6) {
		return { ok: false, error: '曜日は月曜から土曜の中から選んでください' };
	}
	const period = readInteger(input.period);
	if (period === null || period < 1 || period > DEFAULT_PERIODS.length) {
		return { ok: false, error: '時限を選んでください' };
	}
	const roomInput = input.room ?? '';
	if (typeof roomInput !== 'string')
		return { ok: false, error: '教室名は文字列で指定してください' };
	const room = roomInput.trim();
	if (room.length > MAX_ROOM_LENGTH) {
		return { ok: false, error: `教室名は ${MAX_ROOM_LENGTH} 文字以内で入力してください` };
	}
	if (!/^\P{Cc}*$/u.test(room)) {
		return { ok: false, error: '教室名に改行などの制御文字は使えません' };
	}
	return { ok: true, value: { weekday, period, room: room === '' ? null : room } };
}

export type AbbreviationResult =
	{ readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: string };

/** 科目の略称。空は「正式名称に戻す」指定として受け付ける */
export function parseAbbreviation(input: unknown): AbbreviationResult {
	if (typeof input !== 'string') {
		return {
			ok: false,
			error: '略称の入力を確認してください。空欄で保存すると正式名称に戻ります。',
		};
	}
	const value = input.trim();
	if (value.length > MAX_ABBREVIATION_LENGTH) {
		return { ok: false, error: `略称は ${MAX_ABBREVIATION_LENGTH} 文字以内で入力してください。` };
	}
	return { ok: true, value };
}
