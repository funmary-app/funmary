# AI エージェントへの指示

このリポジトリで作業する AI エージェント (Claude Code、Codex など) への指示です。人間の開発者向けの決まりは [CONTRIBUTING.md](CONTRIBUTING.md) にあり、この文書と同じく守ってください。

## プロジェクトの概要

Funmary は、公立はこだて未来大学の学生向けの便利な総合 Web アプリです。大学とは関係のない非公式のアプリです。pnpm workspace のモノレポで、画面は SvelteKit、機械向けの API は Hono、データは SQLite で作ります。本番は VPS 1 台の Node.js のプロセス 1 つで動かします。

## 言語

このプロジェクトは日本語で運営しています。

- 文書、コードのコメント、コミットメッセージ、Issue、PR、テストの名前 (`it('...')`) は日本語で書く
- コミットメッセージの接頭辞 (`feat(core):` など) と、コードの識別子は英語にする
- 日本語の文の途中で改行しない。改行は段落や箇条書きの区切りだけにする
- 全角の記号は使わない (！と？を除く)。括弧は `()`、コロンは `:` のように半角にする

## コマンド

| コマンド         | 内容                                         |
| ---------------- | -------------------------------------------- |
| `pnpm install`   | 依存を入れる                                 |
| `pnpm dev`       | 開発サーバーを起動する                       |
| `pnpm lint`      | ESLint                                       |
| `pnpm format`    | Prettier で整形する                          |
| `pnpm typecheck` | `tsc` (TypeScript 7) と svelte-check         |
| `pnpm test`      | Vitest                                       |
| `pnpm test:e2e`  | Playwright                                   |
| `pnpm build`     | ビルドと、ページごとの JavaScript の量の検査 |

変更を終えたら、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test` がすべて通ることを確かめてください。画面を変えたときは `pnpm test:e2e` も実行します。

Windows で開発しているので、npm scripts に POSIX シェル前提の書き方 (`VAR=x cmd`、`rm -rf`) を使わないでください。必要なら Node.js のスクリプトにします。

## 作業の進め方

- 作業は GitHub の Issue に対応させる。Issue の扱い方は [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md) にある
- main からブランチを切って作業し、PR にする。main に直接 push しない
- コミットメッセージとブランチ名は CONTRIBUTING.md の決まりに従う。commitlint が検査する
- 用語とコードの名前は [CONTEXT.md](CONTEXT.md) に合わせる。新しい用語を使うときは CONTEXT.md に足す
- 公開の設計書 (`docs/` の設計の文書) は、実態に即した内容にする。実装や仕様を変えたときは、同じ PR で関係する章も書き換える。作っていないものは「予定」と分かるように書き、実装が済んだら本文に移す
- 分からないことや、作者が決めるべきことは、推測で進めずに質問する
- 各自の手元だけの指示は、Git の管理対象外の `CLAUDE.local.md` (Claude Code) や `AGENTS.local.md` に書く。これらはコミットしない

## 守ること

- 秘密情報 (パスワード、トークン、Webhook の URL、鍵) と個人情報 (氏名、学籍番号、メールアドレス) を、コード、テストのデータ、ログ、コミットに入れない
- 本番のドメインを書かない。例には `funmary.example.com` を使う
- コードのコメント、画面の文言、テストの名前に、設計書の番号や、設計書を参照する言い方 (「設計書 4.5」など) を書かない。理由は、その場で分かるように書く。設計の背景は `docs/design/` にあり、必要なら文書の名前でリンクする
- ほかのプロジェクトのコードをコピーしない。ライセンスや参照元として、ほかの学生向けアプリの名前を書かない
- `packages/core` に I/O を持ち込まない。現在時刻は引数で受け取る
- 外部から取得した HTML は信用しない。`{@html}` を使わず、外部の文字列をキーにする入れ物には `Map` を使う
- Funmary の外へのリンクは、`target="_blank"` と `rel="noopener noreferrer"` を付けて、新しいタブで開く
- 学生ポータルなど大学のサービスへの接続は定期処理だけで行い、取得の間隔の下限 (60 分) を守る
- 依存を足すときは、なるべく小さく、保守が続いていて、非推奨になっていないものを選ぶ。複数のパッケージで使う版は `pnpm-workspace.yaml` の catalog にまとめる

## スキル

`.agents/skills/` に、作業に使うスキルを入れています。該当する作業では、対応するスキルを読んでから始めてください。

| スキル                                            | 使うとき                                                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `svelte-code-writer`、`svelte-core-bestpractices` | `.svelte` や `.svelte.ts` を書く、直すとき。仕上げに `svelte-autofixer` で確かめる                  |
| `hono`                                            | Hono の API を書くとき                                                                              |
| `pnpm`                                            | 依存の追加、workspace や catalog の設定を変えるとき                                                 |
| `vitest`                                          | 単体テストを書くとき                                                                                |
| `tdd`                                             | 機能を足す、不具合を直すとき。テストを先に書く                                                      |
| `playwright-cli`、`playwright-best-practices`     | E2E テストを書くとき、画面を実際に動かして確かめるとき                                              |
| `code-review`                                     | ブランチや PR の変更を見直すとき                                                                    |
| `diagnosing-bugs`                                 | 原因の分からない不具合や、遅さを調べるとき                                                          |
| `codebase-design`                                 | モジュールの分け方やインターフェースを考えるとき                                                    |
| `accessibility`、`web-design-guidelines`          | 画面の使いやすさとアクセシビリティを確かめるとき                                                    |
| `impeccable`                                      | 画面の見た目と使い勝手を作る、見直すとき (`audit`、`polish`、`layout` など)                         |
| `hush-review`、`hush-fix`                         | コードのコメントの質を確かめる、直すとき                                                            |
| `typescript-design`                               | TypeScript のモジュールの分け方、型、エラーの扱いを考えるとき                                       |
| `natural-japanese`、`stop-ai-slop-jp`             | README、docs、Issue、PR などの日本語の文章を書く、直すとき                                          |
| `fix-unnatural-line-breaks`                       | 文の途中の不自然な改行を直すとき (この決まりは「言語」の節にある)                                   |
| `report-skills`、`oi-owarasero`                   | 作者の個人の用途 (レポートの作成、作業が止まったときの対話)。開発の作業では使わない                 |
| `i-have-adhd`                                     | 作者の個人の用途 (応答を ADHD の人が読みやすい形にする)。作者が `/i-have-adhd` と打ったときだけ使う |
| `performance`、`best-practices`                   | 表示の速さ、セキュリティ、Web の一般的な作法を確かめるとき                                          |
| `token-saver-claude-code`、`token-saver-codex`    | 使用量の上限に近いとき、トークンの消費を抑えたいとき、指示ファイルや設定を見直すとき                |

スキルは [skills CLI](https://github.com/vercel-labs/skills) で管理しています。足すときは `npx skills add <owner/repo> -s <スキル名> -a codex -a claude-code -y` を使い、`.agents/skills/` と `skills-lock.json` をコミットします。`.claude/` と `.agent/` は各自の手元の設定なので、コミットしません。
