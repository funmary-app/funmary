# 画面のデザインの方針

画面を作る人と、AI エージェントに向けた、見た目と使い勝手の決まりの要約です。値の出どころと理由は、[設計書の 11 章](design/11-screens.md) にあります。

## 基本

- スマホを基準に作り、同じ画面を PC では配置だけ変える。端末ごとに別の画面は作らない
- 画面幅の区切りは 840px の 1 か所 (`apps/web/src/lib/styles/_breakpoints.scss`)。840px 未満は画面下部のタブ、以上は左のメニュー
- 文字は LINE Seed JP。LINE Seed JP にない字は Noto Sans JP で補う (どちらも `@fontsource/*` を自前で配る。太さは 400 と 700)。読み込む前は OS の標準フォント
- ライトとダークの両方で、すべての画面を確かめる

## 色

大学のロゴの赤を基調にした SMUI (Material Design) のテーマ。画面の色は、CSS のカスタムプロパティ (`--fm-*`) を通して使い、値を直接書かない。

| 役割               | ライト    | ダーク    |
| ------------------ | --------- | --------- |
| primary            | `#9d2126` | `#d6999e` |
| secondary (リンク) | `#3d6cbc` | `#9fb8e6` |
| 本文               | `#333333` | `#e6e1e1` |
| 背景               | `#ffffff` | `#141212` |

- 本文のコントラストは WCAG AA (4.5:1 以上)
- 休講と主色がどちらも赤なので、状態は色だけで伝えない。休講は取り消し線と「休講」、補講は「補講」、教室変更は「教室変更」と新しい教室を添える

## 部品と SCSS

- スタイルは、すべて `<style lang="scss">`。150 行を超えるものは、同じ場所の `.scss` (`+page.svelte` なら `page.scss`、部品なら `部品名.scss`) に分け、`<style>` からは `@use './page';` のように読む。スコープは同じように効く
- 2 つ以上の画面に同じ形で書くものは、`apps/web/src/lib/styles/` の mixin を使う
  - `_mixins.scss`: 並べ方 (`stack()`、`wrap-row()`、`cluster()`)
  - `_forms.scss`: チェックボックスの行 (`choice-row()`)、縦に並べたフォーム (`column()`)
  - `_surfaces.scss`: 線で囲んだ入れ物 (`outlined()`)、薄い背景の入れ物 (`muted-panel`)、秘密の値の枠 (`secret-box`)
  - `_text.scss`: 補足の小さな文字 (`muted()`)、一覧の 1 件の名前 (`item-title`)、状態の札 (`badge`)
  - `_touch.scss`: 押せる高さのリンク (`target()`)、`<details>` の見出し (`summary`)
  - `_tables.scss`: 管理画面の表 (`data`)
  - `_chrome.scss`、`_header-action.scss`: レイアウトのロゴとフッター、上のバーの操作
- ページ本文の幅は `.page` (既定 44rem)。広い表だけ `.page-w-<rem>` で広げる
- 補助の文字は `.muted`、画面の外に隠す文字は `.visually-hidden`
- 確認のポップアップを出す操作は `confirmSubmit` のアクション (フォームの `use:enhance` より先に書く)

## 操作

- キーボードだけで、すべての操作ができる。フォーカスの位置が見える。Tab の順番は見た目の順番
- 押せる範囲の大きさ (48px 以上) と位置は、表示や状態が変わっても保つ。ボタンや欄が動かない
- hover でしか出ない情報は作らない
- 外のサイトへのリンクは、新しいタブで開き、`rel="noopener noreferrer"` を付ける

## 文言

画面の文言は、日本語で、全角の記号は ！と？以外は使わず、設計書の番号や、設計書を指す言い方は書かない。
