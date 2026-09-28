# 開発への参加

Funmary の開発に参加する人に向けた決まりと手順です。文書、コードのコメント、コミットメッセージ、Issue、PR は日本語で書きます。

## 手元で動かす

### 用意するもの

- Git
- [fnm](https://github.com/Schniz/fnm) (Node.js の版の管理)。シェルの設定に `fnm env --use-on-cd` を入れておくと、リポジトリに入ったときに `.nvmrc` の版 (24 系) へ自動で切り替わります
- [pnpm](https://pnpm.io/ja/installation)。版は `package.json` の `packageManager` に書いたものが使われます

### 初回の手順

```sh
git clone https://github.com/funmary-app/funmary.git
cd funmary
fnm install
fnm use
pnpm install
pnpm dev
```

`pnpm install` のときに、コミット前の検査を行う Git のフック (simple-git-hooks) も入ります。

### よく使うコマンド

| コマンド         | 内容                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`       | 開発サーバーを起動する (http://localhost:5173)                                                                                          |
| `pnpm lint`      | ESLint で検査する                                                                                                                       |
| `pnpm format`    | Prettier で整形する。`pnpm format:check` は確認だけ                                                                                     |
| `pnpm typecheck` | TypeScript 7 の `tsc` と svelte-check で型を検査する。`pnpm typecheck:ts6` は 6 系の `tsc6` での検査 (7 系と判定が食い違わないかを見る) |
| `pnpm test`      | Vitest で単体テストを実行する。`pnpm test:watch` は変更を見張って実行し直す                                                             |
| `pnpm test:e2e`  | Playwright で E2E テストを実行する。初回は `pnpm --filter @funmary/web exec playwright install chromium` でブラウザを入れる             |
| `pnpm build`     | 本番用にビルドし、ページごとの JavaScript の量 (圧縮後 60 KB まで) を検査する                                                           |

### TypeScript は 2 つの版を併用する

型の検査には TypeScript 7 (`tsc`) を使います。ただし typescript-eslint と svelte-check は、JavaScript の API を `typescript` という名前で読み込み、まだ 7 系に対応していません。これらには、Microsoft が橋渡しとして出している `@typescript/typescript6` (6 系) を渡します。`package.json` では次のように入れています。

- `typescript` は `npm:@typescript/typescript6@^6.0.2` の別名。ツールが読み込む 6 系。コマンドは `tsc6`
- `@typescript/native` は `npm:typescript@^7.0.2` の別名。型検査に使う 7 系。コマンドは `tsc`

`typescript` を 7 系に更新するだけだと、`tsc` は速くなっても lint と svelte-check が動かなくなります。この 2 つを分けて持つのが、7 系が出た時点での正規の使い方です。役割は次のとおりです。

| 使うもの                        | 用途                                                                   |
| ------------------------------- | ---------------------------------------------------------------------- |
| `tsc` (7 系)                    | `.ts` の型検査 (約 3 秒。6 系の約 4 分の 1)                            |
| `tsc6` (6 系)                   | 7 系と判定が食い違わないかの確認 (`pnpm typecheck:ts6`。CI でも動かす) |
| typescript-eslint、svelte-check | 6 系の API を使う                                                      |

TypeScript の版を上げる変更は、互換性の確認 (6 系と 7 系の結果の比較) と、速度の測定を、別の PR にします。混ぜると、不具合の原因を切り分けにくくなります。両ツールが 7 系に対応したら、別名をやめて 7 系だけにします (Issue #43)。

## 作業の流れ

1. 作業は Issue から始めます。Issue がなければ、テンプレート (不具合の報告、機能の提案、作業) を選んで作ります。
2. main からブランチを切ります。main に直接 push はしません。
3. 変更をコミットし、PR を作ります。PR の本文に `Closes #123` のように Issue の番号を書くと、マージしたときに Issue が閉じます。
4. CI がすべて通ったら、merge commit でマージします。PR の中のコミットはそのまま main の履歴に残り、merge commit のメッセージには PR のタイトルと本文が入ります。そのため、各コミットと PR のタイトルの両方をコミットメッセージの決まりに合わせます。

### ブランチ名

`<種類>/<内容>` の形で、英小文字の単語をハイフンでつなぎます。種類はコミットメッセージの種類と同じものを使います。

```
feat/timetable-expand
fix/ics-timezone
docs/contributing
```

## コミットメッセージ

[Conventional Commits](https://www.conventionalcommits.org/ja/v1.0.0/) の形に合わせます。接頭辞 (種類とスコープ) は英語、説明は日本語で書きます。

```
<種類>(<スコープ>): <説明>

<本文 (任意)>

<フッター (任意)>
```

例:

```
feat(core): 時限の時刻の初期値を追加
fix(web): 週の時間割で土曜の授業が表示されない問題を修正
docs: CONTRIBUTING にブランチ名の決まりを追記
chore(deps): 依存を更新: svelte → ^5.58.0
```

### 種類

| 種類       | 使うとき                                          |
| ---------- | ------------------------------------------------- |
| `feat`     | 機能を足す、変える                                |
| `fix`      | 不具合を直す                                      |
| `docs`     | 文書だけを変える                                  |
| `style`    | 動きを変えない見た目の整形 (空白、セミコロンなど) |
| `refactor` | 動きを変えずにコードの構造を直す                  |
| `perf`     | 速さや軽さを改善する                              |
| `test`     | テストを足す、直す                                |
| `build`    | ビルドの仕組みや依存を変える                      |
| `ci`       | CI の設定を変える                                 |
| `chore`    | 上のどれにも当てはまらない雑務                    |
| `revert`   | 以前のコミットを取り消す                          |

### スコープ

変更したパッケージや領域の名前を書きます。複数にまたがるときや、どれにも当てはまらないときは省きます。

`web`、`core`、`db`、`auth`、`api`、`sources`、`notify`、`jobs`、`extension`、`deploy`、`deps`、`ci`、`repo`、`docs`

### 説明の書き方

- 何をしたかを日本語で簡潔に書きます。目安は全角 30 字程度で、ヘッダー全体は 100 文字までです。
- 文末に句点 (。) を付けません。
- 本文には、なぜその変更をしたかを書きます。何を変えたかは差分を見れば分かるので、繰り返さなくてかまいません。
- 互換性を壊す変更は、種類の後ろに `!` を付け (`feat(api)!: ...`)、フッターに `BREAKING CHANGE: <内容>` を書きます。

コミットメッセージは commitlint で検査します。コミットのときには Git のフックが、PR では各コミットとタイトルを CI が検査します。

## コードの書き方

- 整形は Prettier に任せます。コミットのときに、変更したファイルだけ自動で整形されます。
- `packages/core` には I/O (ファイル、ネットワーク、DB) を持ち込みません。現在時刻も引数で受け取り、テストで日付を自由に変えられるようにします。
- 外部から取得した HTML の中身は信用しません。画面に出すときは Svelte の通常の出力だけを使い、`{@html}` は使いません。外部の文字列をキーにする入れ物には `Map` を使います。
- 秘密情報 (パスワード、トークン、Webhook の URL) と個人情報は、コード、テストのデータ、ログに入れません。テストに使う HTML は、実名と学籍番号を伏せてから入れます。
- README などで本番のドメインを書かず、`funmary.example.com` と書きます。CI が検査します。
- ほかのプロジェクトのコードをコピーしません。
- GitHub Actions のワークフロー (`.github/workflows/`) に、数行を超えるシェルのスクリプトを直接書きません。JavaScript にして `scripts/workflows/<ワークフローのファイル名>/<処理の名前>.js` に置き、`node scripts/workflows/...` で呼びます。判断の部分は関数に分けて、隣に `*.test.js` を置きます。
- `scripts/` と `apps/web/scripts/` の補助のスクリプトは JavaScript で書き、型は JSDoc で書きます。`checkJs` で `pnpm typecheck` の検査を受けます。

用語の使い分けは [CONTEXT.md](CONTEXT.md) にまとめています。コードの名前もこれに合わせます。

## テスト

- 単体テストは Vitest で書き、対象のファイルと同じ場所に `*.test.ts` として置きます。
- E2E テストは Playwright で書き、`apps/web/e2e/` に置きます。
- 不具合を直すときは、先にその不具合を再現するテストを書きます。

## 依存の更新

依存の更新は Renovate が PR を作ります。自分で依存を上げる PR は作らなくてかまいません。

- 第 1 と第 3 月曜の 10 時台 (日本時間) に、パッチとマイナーの更新を 1 つの PR にまとめます。CI が通れば自動でマージされます。
- メジャーの更新は、同じ時刻にパッケージごとの PR になります。変更点を読んでから手でマージします。
- 公開から 3 日たっていない版は取り込みません。
- 脆弱性の修正は、時刻を待たずに PR になります。

待機中の更新は、Issue の "依存の更新の一覧 (Dependency Dashboard)" で確かめられます。

## AI エージェントを使うとき

AI エージェントへの指示は [AGENTS.md](AGENTS.md) にまとめています。エージェント向けのスキルは `.agents/skills/` にあり、[skills CLI](https://github.com/vercel-labs/skills) で管理しています。`skills-lock.json` から復元するには `npx skills experimental_install` を実行します。
