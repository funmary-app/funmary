import { createSettingsStore, type Database } from '@funmary/db';
import { useTestDatabase } from '@funmary/db/testing';
import { describe, expect, it } from 'vitest';
import { readRegistration, saveRegistration } from './registration.ts';

let database: Database;
useTestDatabase('funmary-registration-', (db) => (database = db));

const NOW = new Date('2026-10-25T03:00:00Z');

describe('登録の方式', () => {
	it('保存していなければ招待制にし、保存した方式を読み戻せる', () => {
		const settings = createSettingsStore(database);
		expect(readRegistration(settings)).toBe('invite');
		saveRegistration(settings, 'open', NOW);
		expect(readRegistration(settings)).toBe('open');
	});

	it('保存された値が選べる方式でなければ、招待制にする', () => {
		const settings = createSettingsStore(database);
		settings.set('registration', 'free', NOW);
		expect(readRegistration(settings)).toBe('invite');
	});
});
