# 5. 開発ツール

pnpm workspace、TypeScript 7、ESLint、Prettier、Renovate、GitHub Actions の使い方と、その理由をまとめます。

## 5.1 パッケージ管理は pnpm workspace

リポジトリ全体を pnpm workspace のモノレポにします。複数のパッケージで使う依存の版は、pnpm の catalog で 1 か所にまとめます。

```yaml
# pnpm-workspace.yaml (抜粋)
packages:
  - apps/*
  - packages/public/*
  - packages/private/*

catalog:
  svelte: ^5.57.1
  hono: ^4.13.12
  valibot: ^1.5.0
```

各パッケージの `package.json` では `"hono": "catalog:"` のように書きます。リポジトリの中のパッケージ同士は `"@funmary/core": "workspace:*"` で参照します。

リポジトリの中のパッケージはビルドしません。`exports` で `.ts` のソースを直接指し、Vite とバンドラがまとめて変換します。ビルドの手順が増えず、エディタからも定義へ直接飛べます。

## 5.2 TypeScript 7 は `tsc` に使い、型情報を読むツールには 6 系を渡す

TypeScript 7 は Go で書き直された版で、型検査が大幅に速くなっています。一方で、TypeScript の JavaScript API を使うツールは、まだ 7 系に対応していません。typescript-eslint と svelte-check が、その例です。

そこで、2 つの版を別名で入れます。

```jsonc
// package.json (ルート)
{
  "devDependencies": {
    // 型情報を読むツール (typescript-eslint、svelte-check) 向け。コマンドは tsc6
    "typescript": "npm:@typescript/typescript6@^6.0.2",
    // 型検査に使う TypeScript 7。コマンドは tsc
    "@typescript/native": "npm:typescript@^7.0.2",
  },
}
```

| 検査の対象         | 使うもの                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `.ts` の型検査     | `tsc --noEmit` (TypeScript 7)。ルートの `tsconfig.json` 1 つで `apps/web` 以外をまとめて検査する |
| `.svelte` の型検査 | svelte-check (内部で 6 系の API を使う)                                                          |
| 型情報を使う lint  | typescript-eslint (6 系の API を使う)                                                            |

`.svelte` のファイルだけは 6 系で検査することになりますが、6 系は 7 系へ移るまでのつなぎとして出た版なので、型の判定はほぼ一致します。念のため、`pnpm typecheck:ts6` で 6 系の `tsc6` でも同じ検査を回し、7 系との結果を比べられるようにしています。

ツールが 7 系に対応したら、別名をやめて 7 系だけにします。別名は、ツールが `typescript` という名前で読み込むために必要で、`@typescript/typescript6` をそのまま入れても、ツールには届きません。pnpm の `overrides` や `packageExtensions` でツールごとに渡す方法も考えましたが、peer の依存には効かない、または設定が複雑になるので、別名のほうが単純で壊れにくいと判断しました。

tsconfig では、6 系で非推奨になった設定 (`baseUrl`、`moduleResolution: "node"` など) を使いません。基本は `"strict": true`、`"module": "preserve"`、`"moduleResolution": "bundler"`、`"verbatimModuleSyntax": true` です。

## 5.3 ESLint と Prettier

`eslint.config.js` はフラットな設定で 1 つにまとめます。ESLint の推奨に加えて、typescript-eslint の `recommendedTypeChecked`、eslint-plugin-svelte の推奨、Prettier との衝突を防ぐ設定を重ねています。

型情報を使うルールは検査が遅くなりますが、Promise の待ち忘れのような、実害のある誤りを拾えるので入れています。[3.5](03-quality.md#35-壊れにくさとフォールバック) の壊れにくさにも直結します。

Prettier は、タブでのインデント、シングルクォート、1 行 100 文字を基本にしています。Markdown と YAML だけは、インデントにスペースを使います。

## 5.4 よく使うコマンド

| コマンド         | 内容                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `pnpm dev`       | 開発サーバーを起動する                                                                        |
| `pnpm lint`      | ESLint                                                                                        |
| `pnpm format`    | Prettier で整形する。`pnpm format:check` は確認だけ                                           |
| `pnpm typecheck` | `tsc --noEmit` と svelte-check                                                                |
| `pnpm test`      | Vitest                                                                                        |
| `pnpm test:e2e`  | Playwright                                                                                    |
| `pnpm build`     | 本番用にビルドする。ページごとの JavaScript の容量も検査する ([3.1](03-quality.md#31-目標値)) |

CI では、これらのコマンドに加えて、秘密情報の混入検査とコミットメッセージの検査を実行します ([5.6](#56-ci-は-github-actions-で回す))。

## 5.5 依存の更新は Renovate にまとめる

Renovate は、依存の新しい版が出たときに、更新の PR を自動で作るツールです。GitHub では、Mend が無料で提供している GitHub App を入れるだけで動き、自分でサーバーやワークフローを用意する必要はありません。依存の更新はすべて Renovate に任せ、Dependabot の更新 PR (version updates) は使いません。

### 更新の扱い

| 更新の種類                          | 扱い                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| パッチとマイナー                    | 1 週間に 1 回 (月曜の 10 時台) 1 つの PR にまとめ、CI が通れば自動でマージする      |
| メジャー                            | パッケージごとに PR を作る。作るのは上と同じ周期で、自動ではマージしない            |
| SMUI (`@smui/*`、`@smui-extra/*`)   | 版をそろえて使うので、ほかのパッケージとは別の PR にまとめる                        |
| lockfile の更新                     | 上と同じ周期。自動でマージする                                                      |
| 脆弱性の修正                        | 周期を待たず、すぐに PR を作る                                                      |
| GitHub Actions のアクション         | コミットのハッシュで固定し、上と同じ扱いで更新する                                  |
| Node.js (`.nvmrc`) と `@types/node` | 対応の下限の 24 系から上げない ([4.1](04-packages.md#41-選ぶ基準と版の方針) の例外) |

公開から 3 日たっていない版は取り込みません。公開直後に乗っ取られた版や、すぐに取り下げられた版を避けるためです。

CI が落ちた更新は、自動でマージされず、PR が残ります。残った PR は、直すか、その版を見送るかを判断します。設定は、リポジトリ直下の `renovate.json5` にあります。書き誤りは、CI で Renovate の設定の検証を動かして見つけます。

### 使い始める手順

自分のフォークで Renovate を使うときは、GitHub の画面で次の設定をします。

1. GitHub Marketplace の「Renovate」(Mend 提供) を入れ、対象のリポジトリを選ぶ。設定ファイルがすでにあれば、Renovate は最初の案内の PR を作らずに動き始める
2. リポジトリの Settings の General で、「Allow auto-merge」を有効にする。Renovate は GitHub の自動マージの機能を使ってマージする
3. Settings の Rules で main に ruleset を作り、「Require status checks to pass」に CI の必須のジョブを登録する。これがないと、自動マージが動かないか、CI を待たずにマージされてしまう
4. Settings の Code security で、Dependabot alerts を有効にする。Renovate は脆弱性の情報をここから読む。Dependabot の version updates は有効にしない

動き始めると、Renovate は「Dependency Dashboard」という Issue を作ります。待機中の更新の一覧が載り、チェックを入れると、決まった時刻を待たずに PR を作らせられます。困ったら、まずこの Issue を見てください。

## 5.6 CI は GitHub Actions で回す

ワークフローは `.github/workflows/` に置いています。

| ワークフロー             | 動くとき                      | 内容                                                                                                                                   |
| ------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `CI`                     | PR と、main への push         | 検査とビルド、E2E テスト、秘密情報の混入検査、コミットメッセージの検査                                                                 |
| `CI を飛ばす頼み`        | PR へのコメント               | コメントに `!ignore_ci` とあれば、その PR の `CI` を動かし直す (重い検査を飛ばすかは `CI` が決める)                                    |
| `Windows での単体テスト` | main への push                | Windows で `pnpm install` と `test` を動かし、手元の開発環境で壊れていないかを見る。PR の待ち時間を延ばさないよう、CI とは別にしている |
| `Renovate の設定の検証`  | `renovate.json5` を変えたとき | Renovate の設定の検証                                                                                                                  |
| `Release`                | main の CI が通ったとき       | リリースの tar.gz を作り、GitHub Releases に置く                                                                                       |
| `Deploy`                 | `Release` が終わったとき      | VPS に新しいリリースを入れる                                                                                                           |
| `節目の版のリリース`     | 手で起動                      | patch、minor、major、または版の番号を指定して、節目の版のリリースを作る                                                                |
| `ミラーへの複製`         | main とタグの push            | ミラーのリポジトリへ複製する                                                                                                           |

### `CI` のジョブ

| ジョブ                   | 内容                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CI を飛ばすかの判定      | PR のときだけ動き、検査とビルド、E2E テストを飛ばすかを決める (下の「PR で重い検査を飛ばす」)                                                                                                                |
| 検査とビルド             | `format:check`、`lint`、`typecheck`、`test`、`build` (ページごとの JavaScript の容量の検査を含む)                                                                                                            |
| E2E テスト               | Playwright。ブラウザは Chromium だけを入れる                                                                                                                                                                 |
| 秘密情報の混入検査       | gitleaks と、本番のドメインの混入検査                                                                                                                                                                        |
| コミットメッセージの検査 | PR に含まれる各コミットと PR のタイトルを commitlint で検査する。マージは merge commit で行い、PR の中のコミットは main の履歴に残り、merge commit のメッセージは PR のタイトルになるため。PR のときだけ動く |

これらは、main の ruleset で必須のジョブにしています。コミットメッセージの検査は main への push では飛ばされますが、GitHub は、飛ばされたジョブを成功として扱います。

### PR で重い検査を飛ばす

次のどちらかのとき、PR の検査とビルド、E2E テストを飛ばして、待ち時間を短くします。秘密情報の混入検査とコミットメッセージの検査は、20 秒ほどで終わるので、いつも動かします。

- 文書だけの変更 (`*.md`、`docs/`、`.github/ISSUE_TEMPLATE/`)。main への push の `paths-ignore` と同じ範囲です
- PR のタイトルか本文、またはコメントに `!ignore_ci` とある。書いた人が、リポジトリの所有者かメンテナー (役割が admin か maintain) のときだけ受けます。外部の人や、書き込みの権限だけの人が書いても飛ばしません。コメントで頼むと、`CI を飛ばす頼み` が CI を動かし直します

必須のジョブがあるので、`paths-ignore` でワークフローごと止めると、PR をマージできなくなります。そのため、判定のジョブ (`scripts/workflows/ci/ci-skip.js`) で決め、重いジョブを `if` で飛ばします。判定に失敗したときは、飛ばさずにすべて動かします。

### 共通の書き方

- pnpm は `pnpm/action-setup` で入れます。版は `package.json` の `packageManager` から読まれます
- Node.js は `actions/setup-node` の `node-version-file: .nvmrc` で入れ、`cache: pnpm` で依存のダウンロードをキャッシュします。手元と CI で Node.js の版が食い違いません
- 依存は `pnpm install --frozen-lockfile` で入れます。lockfile と `package.json` がずれていれば失敗します
- ワークフローの権限は、既定で `contents: read` に絞ります。書き込みが要るジョブだけ、個別に足します
- 同じブランチで新しい push があったら、古い実行は `concurrency` で取り消します
- アクションはコミットのハッシュで指定し、Renovate が更新します。タグは付け替えられることがあるためです

### E2E テストのログイン

Google のログインは、CI で自動化できません。E2E テストでは、テスト用の OpenID Connect のサーバーを立てて、Google の代わりにします。本番と同じ openid-client の手順を通るので、ログインの処理を試験用に分岐させずに済みます。

E2E テストは、ファイルを並べて動かします。テスト用の OpenID Connect のサーバーは、テストの前に 1 つだけ立てます (`e2e/global-setup.ts`)。ブラウザは `x-e2e-worker` ヘッダーでどのワーカーかを名乗り、サーバーは、次にログインする人と ID トークンの壊し方を、ワーカーごとに分けて持ちます。全体の設定を変えるファイル (管理画面、Webhook の上限) は、ほかのファイルの確かめる画面を変えてしまうので、ほかがすべて終わってから動かします (Playwright の teardown のプロジェクト。前のファイルが落ちても動きます)。テストが DB に直接書くときは、サーバーと書き込みを取り合っても待てるよう、初めに書き込みの鍵を取ります。

### 秘密情報の混入検査

- gitleaks は、公式の Docker イメージで CLI を直接動かします。gitleaks の GitHub Action は、組織のアカウントのリポジトリではライセンスキーを求めるためです
- 本番のドメインがコミットされていないかは、`git grep` で追跡中のファイルを検査します。探す文字列は Actions の secret に置きます。secret はログで伏せられるので、ドメインがログにも残りません。フォークからの PR では secret を読めないので、この検査は飛ばします

### リリース

main の CI が通ると、ビルドしてから次のファイルを GitHub Releases に置きます。VPS の更新スクリプトは、これを取得します。main から作るリリースは、`build-<コミットの短いハッシュ>` という名前のプレリリースです。節目の版は、手でタグを打つか、`節目の版のリリース` のワークフローで作ります。

- ビルド済みのアプリ、`deploy/`、better-sqlite3 だけを依存に持つ `package.json` をまとめた tar.gz
- 同梱したライブラリのライセンス文 (`THIRD_PARTY_LICENSES.txt`)
- tar.gz の SHA-256 のチェックサム
- ビルド結果のハッシュ。中身が前のリリースと同じなら (文書だけの変更など)、更新スクリプトは再起動を省く

### npm への公開

npm に公開するのは、`funmary` (コマンド)、`@funmary/client`、`@funmary/mcp` の 3 つだけです。ほかのパッケージは `private` で、テスト (`scripts/publishable-packages.test.js`) が、この 3 つ以外に `private` を外したものがないこと、公開の設定 (範囲、provenance、含めるファイル) がそろっていることを確かめます。

- 公開は、ワークフロー `Publish npm` を、GitHub の Actions の画面から、手で実行して行います。入力は、`patch`、`minor`、`major` (npm にある、いちばん新しい版から上げます。まだなければ `0.0.0` から)、または版そのもの (`1.0.0`、`1.1.0-beta.0` のような先行版も可) です。3 つは、同じ版で出します。dist-tag は、空なら、先行版は先行版の名前 (`beta` など)、通常の版は `latest` になります
- main の最新から、CI と同じ検査 (整形、lint、型、単体テスト) を通し、版を 3 つの `package.json` に書き込んでビルドし、`pnpm pack` で tar.gz にして (`workspace:*` の依存が、公開する版に書き換わる)、依存される順 (client、mcp、funmary) に、npm の CLI で公開します。npm にある版は飛ばすので、途中で失敗しても、同じ版でやり直せます
- 公開したあと、版を書き込んだコミット (`chore(release): ...`) と、`npm-v<版>` のタグを、GitHub App (`funmary-release`) の名前で main に push します。main は保護されていて、この App だけが、ruleset の例外です。コミットには `[skip ci]` を付け、CI と本番へのデプロイは動かしません。App の ID と秘密鍵は、リポジトリの変数 `RELEASE_APP_CLIENT_ID` と secret `RELEASE_APP_PRIVATE_KEY` に置きます
- 公開のあと、`npm-v<版>` のタグと GitHub Release (変更の一覧は、自動で作る) を作ります。`v*` のタグは、アプリ本体の節目の版が使っているので、別の名前にしています。アプリの更新は、最新の Release (latest) を見るので、npm の Release は、latest にしません
- npm の trusted publishing (OIDC) で公開するので、npm のトークンを secret に置きません。公開の記録には、どのコミットから、どのワークフローで作ったかを示す provenance が付きます。npm 側で、3 つのパッケージのそれぞれに、このリポジトリ (`funmary-app/funmary`) とワークフローのファイル名 (`publish-npm.yml`) を、公開者 (trusted publisher) として登録しておきます
- 公開する版の入口は、ビルドした `dist` を指します (開発では `src` を指します)。ビルドは tsdown で、ESM と型定義を作ります
