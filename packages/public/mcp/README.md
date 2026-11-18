# @funmary/mcp

[Funmary](https://github.com/funmary-app/funmary) の MCP サーバーです。手元の PC で起動すると、Claude Desktop などから時間割、休講情報、予定、バスの時刻表を確認できます。書き込みを許可すると、予定や履修科目の変更、通知の既読化もできます。Funmary は公立はこだて未来大学の学生向けの非公式アプリです。

## 使い方

Funmary の設定画面で、個人用のアクセストークンを発行し、クライアントの設定に書きます。

```json
{
  "mcpServers": {
    "funmary": {
      "command": "npx",
      "args": ["-y", "@funmary/mcp"],
      "env": {
        "FUNMARY_URL": "https://funmary.example.com",
        "FUNMARY_TOKEN": "fmy_..."
      }
    }
  }
}
```

- `FUNMARY_URL`: 使っている Funmary のサーバーの URL。既定値は持ちません
- `FUNMARY_TOKEN`: 個人用のアクセストークン。発行時に選んだスコープ (`read:lessons`、`write:events` など) に対応する MCP ツールを使えます。書き込みのスコープは、データの変更が必要なときだけ選びます

MCP ツールの定義はサーバーと共通です。OAuth に対応するクライアントは、Funmary の `/mcp` に直接接続できます。

## ライブラリとして

```ts
import { createFunmaryMcpServer, createClientData } from '@funmary/mcp';
import { createFunmaryClient } from '@funmary/client';

const client = createFunmaryClient({ baseURL, token });
const server = createFunmaryMcpServer({
  data: createClientData(client),
  scopes: (await client.me()).scopes,
});
```

## ライセンス

BSD-3-Clause または Apache-2.0 (好きな方を選べます)。
