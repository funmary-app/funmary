import { describe, expect, it } from 'vitest';
import { buildReleaseNotes, parseChange } from './release-notes.js';

/** @type {import('./release-notes.js').ReleaseNotesInput} */
const BASE = {
	repo: 'funmary-app/funmary',
	version: 'build-54ffc9b',
	sha: '54ffc9b1111111111111111111111111111111aa',
	previousVersion: 'build-0de56d8',
	previousSha: '0de56d81111111111111111111111111111111bb',
	subjects: [],
	changedFiles: [],
};

describe('parseChange', () => {
	it('コミットの決まり (type(scope): 説明 (#番号)) を、種類、範囲、説明、PR の番号に分ける', () => {
		expect(parseChange('feat(auth): ログインの画面を足す (#66)')).toEqual({
			type: 'feat',
			scope: 'auth',
			description: 'ログインの画面を足す',
			pr: 66,
			breaking: false,
		});
	});

	it('範囲や PR の番号がなくても読める。! は、互換性を壊す変更', () => {
		expect(parseChange('fix: 起動の不具合を直す')).toMatchObject({
			type: 'fix',
			scope: null,
			pr: null,
		});
		expect(parseChange('feat(api)!: 形を変える (#9)')).toMatchObject({ breaking: true });
	});

	it('決まりに合わない題は、その他として、そのまま説明にする', () => {
		expect(parseChange('何かの変更')).toEqual({
			type: 'other',
			scope: null,
			description: '何かの変更',
			pr: null,
			breaking: false,
		});
	});
});

describe('buildReleaseNotes', () => {
	it('変更を、種類ごとに分けて、PR へのリンクつきで並べる', () => {
		const notes = buildReleaseNotes({
			...BASE,
			subjects: [
				'feat(auth): ログインの画面を足す (#66)',
				'fix(web): 空の HOST で起動できない不具合を直す (#60)',
				'chore: スキルを足す (#61)',
			],
		});
		expect(notes).toContain('## 機能');
		expect(notes).toContain(
			'- ログインの画面を足す (auth) ([#66](https://github.com/funmary-app/funmary/pull/66))',
		);
		expect(notes).toContain('## 不具合の修正');
		expect(notes).toContain('## その他');
		expect(notes.indexOf('## 機能')).toBeLessThan(notes.indexOf('## 不具合の修正'));
		expect(notes.indexOf('## 不具合の修正')).toBeLessThan(notes.indexOf('## その他'));
	});

	it('変更のない種類の見出しは、出さない', () => {
		const notes = buildReleaseNotes({ ...BASE, subjects: ['feat: 足す (#1)'] });
		expect(notes).not.toContain('## 不具合の修正');
		expect(notes).not.toContain('## その他');
	});

	it('互換性を壊す変更は、先頭で目立たせる', () => {
		const notes = buildReleaseNotes({ ...BASE, subjects: ['feat(api)!: 形を変える (#9)'] });
		expect(notes.indexOf('互換性を壊す変更')).toBeGreaterThanOrEqual(0);
		expect(notes.indexOf('互換性を壊す変更')).toBeLessThan(notes.indexOf('## 機能'));
	});

	it('変更されたファイルから、反映のときに確かめることを書く', () => {
		const notes = buildReleaseNotes({
			...BASE,
			subjects: ['feat: 足す (#1)'],
			changedFiles: [
				'packages/db/migrations/0001_subjects.sql',
				'.env.example',
				'deploy/update.sh',
				'pnpm-lock.yaml',
				'apps/web/src/hooks.server.ts',
			],
		});
		expect(notes).toContain('## 反映のときに確かめること');
		expect(notes).toContain('DB のマイグレーション');
		expect(notes).toContain('環境変数');
		expect(notes).toContain('deploy/');
		expect(notes).toContain('依存');
	});

	it('確かめることがなければ、その節を出さない', () => {
		const notes = buildReleaseNotes({
			...BASE,
			subjects: ['feat: 足す (#1)'],
			changedFiles: ['apps/web/src/routes/+page.svelte'],
		});
		expect(notes).not.toContain('## 反映のときに確かめること');
	});

	it('前回のリリースとの差分へのリンクを付ける', () => {
		const notes = buildReleaseNotes({ ...BASE, subjects: ['feat: 足す (#1)'] });
		expect(notes).toContain(
			'https://github.com/funmary-app/funmary/compare/0de56d81111111111111111111111111111111bb...54ffc9b1111111111111111111111111111111aa',
		);
		expect(notes).toContain('build-0de56d8');
	});

	it('前回のリリースがなければ、初回として書き、差分のリンクは付けない', () => {
		const notes = buildReleaseNotes({
			...BASE,
			previousVersion: null,
			previousSha: null,
			subjects: ['feat: 足す (#1)'],
		});
		expect(notes).not.toContain('/compare/');
		expect(notes).toContain('最初');
	});

	it('変更の題がなければ (再リリースなど)、その旨を書く', () => {
		const notes = buildReleaseNotes({ ...BASE, subjects: [] });
		expect(notes).toContain('前回のリリースからの変更は、ありません');
	});

	it('main へのマージのコミット (Merge ...) は、変更として数えない', () => {
		const notes = buildReleaseNotes({
			...BASE,
			subjects: ['Merge branch main into x', 'feat: 足す (#1)'],
		});
		expect(notes).not.toContain('Merge branch');
	});

	it('題にリンクや見出しの記号が入っていても、行の途中の文字として扱う', () => {
		const notes = buildReleaseNotes({
			...BASE,
			subjects: ['feat: [x](https://evil.example) # 見出し (#3)'],
		});
		// [ と ] が \ で無効にされているので、リンクにならない (エスケープされていない ]( はない)
		expect(notes).not.toMatch(/(?<!\\)\]\(https:\/\/evil/);
		expect(notes).toContain('\\[x\\]');
		expect(notes).toContain('\\# 見出し');
	});
});
