# Issue の扱い方

AI エージェント向けの、Issue と PR の扱い方です。Issue は GitHub の [funmary-app/funmary](https://github.com/funmary-app/funmary/issues) で管理し、`gh` コマンドで操作します。

## 読む

```sh
gh issue view <番号> --comments
gh issue list --state open --label task
```

コミットメッセージや PR の本文に `#123` とあれば、その Issue が作業の仕様です。

## 作る

テンプレートと同じ項目を本文に書きます。タイトルは日本語で、何をするかが分かる短い文にします。

```sh
gh issue create --title "<タイトル>" --label task --body-file <本文のファイル>
```

## ラベル

| ラベル                                     | 意味                                       |
| ------------------------------------------ | ------------------------------------------ |
| `bug`                                      | 不具合                                     |
| `enhancement`                              | 機能の提案、改善                           |
| `task`                                     | 開発の作業                                 |
| `documentation`                            | 文書                                       |
| `dependencies`                             | 依存の更新 (Renovate が付ける)             |
| `major`                                    | メジャーの更新 (Renovate が付ける)         |
| `phase-0`、`phase-1`、`phase-2`、`phase-3` | 設計書のロードマップのどの段階の作業か     |
| `needs-author`                             | 作者の判断や、作者にしかできない作業が要る |

## PR

- 本文の先頭に `Closes #<番号>` を書き、対応する Issue をつなぐ
- タイトルはコミットメッセージの決まり (CONTRIBUTING.md) に合わせる。merge commit のメッセージになる
- PR の中の各コミットもそのまま main の履歴に残るので、どれも決まりに合わせる
