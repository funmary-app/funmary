# Funmary

Funmary (ファンマリー) は、公立はこだて未来大学の学生向けの便利な総合 Web アプリです。

> [!IMPORTANT]
> Funmary は大学とは関係のない非公式のアプリです。大学への問い合わせには使わないでください。

## できること (予定)

Funmary は開発を始めたばかりで、まだ使える機能はありません。最初に作るのは次の機能です。

- 休講、補講、教室変更を反映した個人の時間割
- 授業の予定を Google カレンダーや iPhone のカレンダーに自動で届ける購読 URL (ICS)
- 授業の詳細 (曜日と時限、教室、教員、シラバスの内容、休講の履歴)
- 休講などの知らせを、アプリ内の通知欄、Discord、RSS などのフィードで受け取る機能
- 大学の Google アカウントでのログインと、招待コードによる新規登録

そのあとに、ブラウザのプッシュ通知、授業前のリマインダー、欠席の記録、時間割の共有などを足していきます。

## 使っている技術

| 分野           | 使うもの                      |
| -------------- | ----------------------------- |
| 画面           | SvelteKit、Svelte 5           |
| API            | Hono (SvelteKit の中で動かす) |
| データ         | SQLite                        |
| 実行環境       | Node.js 24 系 (LTS)           |
| パッケージ管理 | pnpm workspace                |
| 検査           | TypeScript、ESLint、Prettier  |
| テスト         | Vitest、Playwright            |

サーバーは VPS 1 台で、Node.js のプロセス 1 つと SQLite のファイル 1 つだけで動かします。

## 開発に参加する

手元で動かす手順と、コミットメッセージやブランチの決まりは [CONTRIBUTING.md](CONTRIBUTING.md) にあります。AI エージェントで開発するときの指示は [AGENTS.md](AGENTS.md) にあります。

開発は [funmary-app/funmary](https://github.com/funmary-app/funmary) で行っています。[otnc/funmary-mirror](https://github.com/otnc/funmary-mirror) は自動で複製しているミラーなので、Issue と PR は funmary-app/funmary に送ってください。

セキュリティ上の問題を見つけたときは、公開の Issue にせず、[SECURITY.md](SECURITY.md) の方法で知らせてください。

## ディレクトリ構成

```
funmary/
├── apps/
│   └── web/          # SvelteKit の画面
├── packages/
│   └── core/         # I/O を持たない処理 (時間割の展開、祝日と学期の判定など)
├── scripts/          # ビルドや検査の補助
└── .agents/skills/   # AI エージェント向けのスキル
```

`packages/` には、今後 `db`、`auth`、`api`、`sources`、`notify`、`jobs` を足していきます。

## 著者

otoneko. a.k.a. marron. https://github.com/otnc

## 貢献者

[![貢献者の一覧](https://contrib.rocks/image?repo=funmary-app/funmary)](https://github.com/funmary-app/funmary/graphs/contributors)

## ライセンス

Funmary のコードは、次の 2 つのライセンスのどちらかを選んで使えます (デュアルライセンス。SPDX の式では `BSD-3-Clause OR Apache-2.0`)。

- BSD 3-Clause License ([LICENSE-BSD-3-CLAUSE](LICENSE-BSD-3-CLAUSE))
- Apache License, Version 2.0 ([LICENSE-APACHE-2.0](LICENSE-APACHE-2.0))

Funmary に送られた貢献も、特に断りがなければ、追加の条件なしに同じ 2 つのライセンスで受け取ります。
