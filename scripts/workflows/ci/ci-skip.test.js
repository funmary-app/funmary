import { describe, expect, it } from 'vitest';
import { decideSkip, isDocsOnly } from './ci-skip.js';

describe('isDocsOnly', () => {
	it('Markdown、docs/、Issue のテンプレートだけの変更なら、文書だけとする', () => {
		expect(
			isDocsOnly(['README.md', 'docs/design/04-packages.md', '.github/ISSUE_TEMPLATE/task.yml']),
		).toBe(true);
		expect(isDocsOnly(['packages/public/mcp/README.md', 'docs/images/screen.png'])).toBe(true);
	});

	it('ほかのファイルが 1 つでも入っていれば、文書だけとしない', () => {
		expect(isDocsOnly(['README.md', 'apps/web/src/app.html'])).toBe(false);
		expect(isDocsOnly(['.github/workflows/ci.yml'])).toBe(false);
		// 名前に md を含むだけのファイルや、docs/ の外の docs という名前のフォルダは、文書ではない
		expect(isDocsOnly(['scripts/build-md.js'])).toBe(false);
		expect(isDocsOnly(['apps/web/docs/page.svelte'])).toBe(false);
	});

	it('変更したファイルが分からない (空) ときは、文書だけとしない', () => {
		expect(isDocsOnly([])).toBe(false);
	});
});

describe('decideSkip', () => {
	const roles = { owner: 'admin', maintainer: 'maintain', writer: 'write', outsider: 'read' };
	const code = ['apps/web/src/app.html'];

	it('文書だけの変更なら、頼まれなくても飛ばす', () => {
		expect(decideSkip({ files: ['README.md'], requests: [], roles }).skip).toBe(true);
	});

	it('所有者かメンテナーが !ignore_ci と書いていれば、コードの変更でも飛ばす', () => {
		for (const author of ['owner', 'maintainer']) {
			const result = decideSkip({
				files: code,
				requests: [{ author, text: 'レビューだけ先に見てほしい !ignore_ci' }],
				roles,
			});
			expect(result.skip).toBe(true);
			expect(result.reason).toContain(author);
		}
	});

	it('書き込みの権限があっても、所有者とメンテナーでなければ飛ばさない。外部の人も同じ', () => {
		for (const author of ['writer', 'outsider', 'unknown']) {
			const result = decideSkip({ files: code, requests: [{ author, text: '!ignore_ci' }], roles });
			expect(result.skip).toBe(false);
		}
	});

	it('!ignore_ci がなければ、コードの変更は飛ばさない', () => {
		const result = decideSkip({
			files: code,
			requests: [{ author: 'owner', text: 'CI を見てください' }],
			roles,
		});
		expect(result.skip).toBe(false);
	});
});
