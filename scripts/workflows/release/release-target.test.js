import { describe, expect, it, vi } from 'vitest';
import { selectReleaseTarget } from './release-target.js';

const head = 'abcdef0'.padEnd(40, '1');
const previous = 'fedcba0'.padEnd(40, '2');

describe('節目の版の対象コミット', () => {
	it('ブランチの先頭にビルドがなければ、直前の公開済みビルドを選ぶ', async () => {
		const hasBuildRelease = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		await expect(selectReleaseTarget([head, previous], hasBuildRelease)).resolves.toBe(previous);
	});

	it('ブランチの先頭に公開済みビルドがあれば、そのコミットを選ぶ', async () => {
		const hasBuildRelease = vi.fn().mockResolvedValue(true);
		await expect(selectReleaseTarget([head, previous], hasBuildRelease)).resolves.toBe(head);
		expect(hasBuildRelease).toHaveBeenCalledTimes(1);
	});

	it('公開済みビルドのないコミットが指定された場合は、別のコミットを選ばない', async () => {
		const hasBuildRelease = vi.fn().mockResolvedValue(false);
		await expect(selectReleaseTarget([head], hasBuildRelease)).resolves.toBeNull();
		expect(hasBuildRelease).toHaveBeenCalledExactlyOnceWith(head);
	});

	it('公開済みビルドの確認に失敗した場合は、処理を止める', async () => {
		const error = new Error('GitHub API の応答を取得できませんでした。');
		const hasBuildRelease = vi.fn().mockRejectedValueOnce(error);
		await expect(selectReleaseTarget([head, previous], hasBuildRelease)).rejects.toBe(error);
		expect(hasBuildRelease).toHaveBeenCalledTimes(1);
	});
});
