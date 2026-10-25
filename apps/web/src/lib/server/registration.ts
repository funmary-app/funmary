// 新規登録の方式 (招待制、誰でも、受け付けない)。管理画面の「登録と招待」で変え、DB の設定に保存する。
import type { Registration } from '@funmary/auth';
import type { SettingsStore } from '@funmary/db';
import * as v from 'valibot';
import { REGISTRATIONS } from '../registration.ts';

const SETTINGS_KEY = 'registration';

const registrationSchema = v.picklist(REGISTRATIONS);

/** 保存された方式。保存していないか、値が壊れていれば、これまでの既定と同じ招待制にする */
export function readRegistration(settings: SettingsStore): Registration {
	const parsed = v.safeParse(registrationSchema, settings.get(SETTINGS_KEY));
	return parsed.success ? parsed.output : 'invite';
}

export function saveRegistration(settings: SettingsStore, value: Registration, now: Date): void {
	settings.set(SETTINGS_KEY, v.parse(registrationSchema, value), now);
}

/** フォームから送られた値を、方式として読む。選べる方式でなければ null */
export function parseRegistration(value: unknown): Registration | null {
	const parsed = v.safeParse(registrationSchema, value);
	return parsed.success ? parsed.output : null;
}
