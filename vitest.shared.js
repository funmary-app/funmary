// 単体テストのすべてのプロジェクト (ルートの vitest.config.js がまとめる各 vitest.config.js) に共通の設定。
// プロジェクトの設定はルートの設定を引き継がないので、各プロジェクトがこれを読み込む

/** @satisfies {import('vitest/config').TestProjectInlineConfiguration['test']} */
export const sharedTestOptions = {
	// テストのファイルごとに作業用のプロセスを作り直すと、毎回の import に時間の半分以上を取られるので、
	// スレッドと読み込んだモジュールを、ファイルどうしで使い回す
	pool: 'threads',
	isolate: false,
	// 使い回すと、差し替えたグローバルや環境変数、vi.spyOn が、後に動くほかのファイルに残る。テストごとに自動で戻す
	unstubGlobals: true,
	unstubEnvs: true,
	restoreMocks: true,
};
