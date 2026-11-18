// 招待コードの画面 (/app/settings/invites、/app/admin/invites) のフォームの値の検査。ブラウザから来る値は信用しない。
import {
	INVITE_ISSUERS,
	MEMBER_INVITE_DAYS,
	MEMBER_INVITE_MAX_USES,
	type InviteSettings,
} from '@funmary/core';
import * as v from 'valibot';
import type { InviteRequest } from './invites.ts';

const MAX_NOTE_LENGTH = 100;
const MAX_USES = 100;
const MAX_DAYS = 365;
const MAX_MONTHLY_LIMIT = 100;

type FormResult<T> =
	{ readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

const text = (form: FormData, name: string) => {
	const value = form.get(name);
	return typeof value === 'string' ? value.trim() : null;
};

/** 整数の欄。min から max まで */
const integerField = (label: string, min: number, max: number) =>
	v.pipe(
		v.string(),
		v.regex(/^\d+$/, `${label}は整数で入れてください`),
		v.transform(Number),
		v.minValue(min, `${label}は ${min} から ${max} にしてください`),
		v.maxValue(max, `${label}は ${min} から ${max} にしてください`),
	);

function firstIssue<T>(result: v.SafeParseResult<v.GenericSchema<unknown, T>>): FormResult<T> {
	if (result.success) return { ok: true, value: result.output };
	return { ok: false, error: result.issues[0].message };
}

/**
 * 発行のフォーム。管理者でない人のフォームには回数と期限の欄がないので、既定の値で読む
 * (実際の値は、発行するときに管理者でない人向けの固定の値にする)
 */
export function parseInviteForm(form: FormData): FormResult<InviteRequest> {
	const schema = v.object({
		maxUses: integerField('使用回数', 1, MAX_USES),
		days: v.nullable(integerField('期限の日数', 1, MAX_DAYS)),
		note: v.nullable(
			v.pipe(
				v.string(),
				v.maxLength(MAX_NOTE_LENGTH, `メモは ${MAX_NOTE_LENGTH} 文字までにしてください`),
			),
		),
	});
	const days = text(form, 'days');
	return firstIssue(
		v.safeParse(schema, {
			maxUses: text(form, 'uses') ?? String(MEMBER_INVITE_MAX_USES),
			// 欄があって空なら期限なし、欄がなければ既定の日数
			days: days === null ? String(MEMBER_INVITE_DAYS) : days === '' ? null : days,
			note: text(form, 'note') || null,
		}),
	);
}

/**
 * 設定のフォーム。「管理者のみ」のときは月の上限の欄を無効にして送らないので、欄がなければ current の上限を残す (モードを戻したときに前の値が使える)
 */
export function parseInviteSettingsForm(
	form: FormData,
	current: InviteSettings,
): FormResult<InviteSettings> {
	const schema = v.object({
		issuers: v.picklist(INVITE_ISSUERS, '発行できる人を選んでください'),
		monthlyLimit: integerField('月の上限', 0, MAX_MONTHLY_LIMIT),
	});
	return firstIssue(
		v.safeParse(schema, {
			issuers: text(form, 'issuers'),
			monthlyLimit: text(form, 'monthlyLimit') ?? String(current.monthlyLimit),
		}),
	);
}
