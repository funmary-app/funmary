/**
 * 新しい順に候補を調べ、最初に公開済みビルドが見つかったコミットを返す。
 * @param {string[]} candidates
 * @param {(sha: string) => Promise<boolean>} hasBuildRelease
 * @returns {Promise<string | null>}
 */
export async function selectReleaseTarget(candidates, hasBuildRelease) {
	for (const sha of candidates) {
		if (await hasBuildRelease(sha)) return sha;
	}
	return null;
}
