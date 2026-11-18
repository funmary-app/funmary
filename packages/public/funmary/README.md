# funmary

[Funmary](https://github.com/funmary-app/funmary) の CLI とライブラリです。端末で今日の授業、今週の時間割、休講情報、バスの時刻表を確認し、手元の MCP サーバーを起動できます。プログラムからは公開 API のクライアントと MCP サーバーの構築に使えます。Funmary は公立はこだて未来大学の学生向けの非公式アプリです。

## 使い方

Funmary の設定画面で、個人用のアクセストークンを発行します。

```sh
npx funmary login --url https://funmary.example.com
```

トークンは、入力を表示せずに尋ねます。パイプでも渡せます (シェルの履歴に残したくないときは、`--token` を使わず、こちらにしてください)。

```sh
echo "$FUNMARY_TOKEN" | npx funmary login --url https://funmary.example.com
```

接続先とトークンは、OS の設定の置き場所に、自分だけが読める権限で保存します。接続先の既定値は持ちません。

| コマンド          | 内容                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `funmary today`   | 今日の授業と予定                                                                                 |
| `funmary week`    | 今週の時間割 (`--date YYYY-MM-DD` で、その日を含む週)                                            |
| `funmary changes` | これからの休講、補講、教室変更 (`--days` で日数。既定は 14)                                      |
| `funmary bus`     | 未来大とバス停の間の、2 つの向きの発車 (`--stop`、`--to`、`--from`、`--day`、`--limit`、`--all`) |
| `funmary mcp`     | 手元の MCP サーバー (stdio) を起動する                                                           |
| `funmary logout`  | 保存した接続先とトークンを消す                                                                   |

- `--json` を付けると、スクリプト向けに JSON で出します (`today`、`week`、`changes`、`bus`)
- 環境変数 `FUNMARY_URL` と `FUNMARY_TOKEN` は、保存した値より先に使います。`NO_COLOR` があれば、色を出しません
- 表は、端末の幅に合わせます

## ライブラリとして

`npm install funmary` だけで、次も使えます。

```ts
import { createFunmaryClient } from 'funmary'; // 公開 API のクライアント (@funmary/client と同じもの)
import { createFunmaryMcpServer, createClientData } from 'funmary/mcp'; // MCP サーバーの組み立て (@funmary/mcp と同じもの)
```

細かく選びたいときは、`@funmary/client` と `@funmary/mcp` を、別々に入れられます。

## ライセンス

BSD-3-Clause または Apache-2.0 (好きな方を選べます)。
