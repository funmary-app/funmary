// ビルドした出力の中から、DB のマイグレーションのフォルダを探す。
// サーバーのコードは 1 つにまとまり、チャンクの置かれる深さは、ビルドのたびや環境によって変わる
// (手元では server/chunks/、CI の Linux では server/chunks/entries/ になった)。
// 自分の場所からの相対パスで決め打ちせず、上の階層へたどって、マイグレーション (<名前>/migration.sql) のあるものを探す。
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** 何階層まで上へたどるか */
const MAX_LEVELS = 4;

/**
 * from (フォルダ) から上へたどって、最初に見つかった `migrations` のフォルダを返す。見つからなければ undefined。
 * TypeScript のまま動かす手元の開発では見つからないので、DB のパッケージの既定の場所に任せる。
 */
export function findMigrationsFolder(from: string): string | undefined {
	let dir = from;
	for (let level = 0; level <= MAX_LEVELS; level++) {
		const candidate = join(dir, 'migrations');
		if (hasMigrations(candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return undefined;
}

/** Drizzle のマイグレーションのフォルダか。マイグレーションごとのフォルダに migration.sql がある */
function hasMigrations(folder: string): boolean {
	if (!existsSync(folder)) return false;
	return readdirSync(folder, { withFileTypes: true }).some(
		(entry) => entry.isDirectory() && existsSync(join(folder, entry.name, 'migration.sql')),
	);
}
