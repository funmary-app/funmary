# @funmary/client

[Funmary](https://github.com/funmary-app/funmary) の公開 API (`/api/v1`) を呼び出す型付きクライアントです。Funmary は公立はこだて未来大学の学生向けの非公式アプリです。

## 使い方

```ts
import { createFunmaryClient, FunmaryApiError } from '@funmary/client';

const funmary = createFunmaryClient({
  baseURL: 'https://funmary.example.com',
  token: process.env.FUNMARY_TOKEN!,
});

const { next } = await funmary.nextLesson();
const week = await funmary.week();
const buses = await funmary.bus.next({ limit: 3 });

try {
  await funmary.courses.register({ name: '線形代数' });
} catch (error) {
  if (error instanceof FunmaryApiError && error.code === 'ambiguous') {
    // 名前が複数の科目に当たったときは、error.body.candidates に候補が入る
  }
}
```

- 接続先の既定値は持ちません。`baseURL` には、使っている Funmary のサーバーの URL を渡します
- トークンは、Funmary の設定画面で発行した個人用のアクセストークンです。書き込む操作には、書き込みの範囲を許したトークンが要ります
- 誤りは `FunmaryApiError` (`status`、`code`、`body`) で返します。通信できなかったときは `status` が 0、`code` が `network_error` です
- `429` (回数の制限) では、`Retry-After` に従って待ち、2 回までやり直します。ほかの誤りは、やり直しません (書き込みを二重にしないため)
- 動いている間に使う依存は `ofetch` だけです。型は、サーバーの OpenAPI の定義から作っています

## ライセンス

BSD-3-Clause または Apache-2.0 (好きな方を選べます)。
