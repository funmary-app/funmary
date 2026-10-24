# セルフホストの手順

Funmary を自分の VPS で動かす手順です。この文書だけで、最初の配置から更新、バックアップまでを行えます。

> [!IMPORTANT]
> Funmary は公立はこだて未来大学の非公式のアプリです。自分でホストしたものを、大学や、大学の学生ポータルの運営として名乗らないでください。学生ポータルへの接続は、この文書の手順に従う限り、定期処理だけが 1 日 3 回行います (60 分に 1 回より頻繁には接続しません)。

## 1. 必要なもの

- Linux の VPS (systemd があるもの。以下は Ubuntu を例にします)
- Node.js 24 以上 (24 系か 26 系の LTS)
- nginx (リバースプロキシ用)
- 独自ドメインと、その証明書 (Let's Encrypt など)
- Google Cloud の OAuth クライアント (大学の Google アカウントでログインするため)
- Discord の Webhook か Bot (任意。管理用の通知を受け取りたい場合)

サーバーは 1 台で、Node.js のプロセス 1 つと SQLite のファイル 1 つだけで動きます。データベースサーバーや、別のキャッシュサーバーは要りません。

以下の例では、ドメインを `funmary.example.com` とします。自分のドメインに読み替えてください。

## 2. サーバーの準備

### 2.1 Node.js

26 系を入れるときは、`setup_24.x` を `setup_26.x` に読み替えます。

```sh
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # v24.x であることを確かめる
```

### 2.2 実行用のユーザー

Funmary は、`funmary` という専用のユーザーで動かします。ログインシェルは要りません。

```sh
sudo useradd --system --create-home --home-dir /home/funmary --shell /usr/sbin/nologin funmary
sudo mkdir -p /etc/funmary
sudo chown funmary:funmary /etc/funmary
sudo chmod 750 /etc/funmary
```

### 2.3 Google の OAuth クライアント

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作る (または既存のものを使う)。
2. 「OAuth 同意画面」を設定する。ユーザーの種類は「External」でよい (大学のアカウントに限る設定は、Funmary 側の `ALLOWED_EMAIL_DOMAINS` で行う)。
3. 「認証情報」から、OAuth クライアント ID を作る。種類は「ウェブ アプリケーション」。
4. 「承認済みのリダイレクト URI」に `https://funmary.example.com/auth/google/callback` を追加する。
5. できたクライアント ID とシークレットを控えておく (あとで環境変数に書く)。

同意画面を「本番」にするまでは、テスト用ユーザーとして登録したアカウントしかログインできません。招待した人数が少ないうちに、テストで動作を確かめてから、本番に切り替えてください。

### 2.4 学生ポータルのアカウント

休講などの情報を取得するため、学生ポータルにログインできるアカウント (ID とパスワード) が要ります。Funmary の管理者自身のアカウントでよく、専用のアカウントを作る必要はありません。このアカウントの情報は、環境変数に書いて Funmary のサーバーだけが使います (画面には出しません)。

## 3. リリースの取得と最初の配置

リリースは GitHub の [Releases](https://github.com/funmary-app/funmary/releases) から、`build-<コミットのハッシュ>` の形の版を取得します (`update.sh` が自動で行うので、通常は手で取得する必要はありません)。

### 3.1 `update.sh` を取得する

`update.sh` 自身は、リポジトリから直接取得します。

```sh
sudo curl -fsSL -o /usr/local/sbin/funmary-update.sh \
  https://raw.githubusercontent.com/funmary-app/funmary/main/deploy/update.sh
sudo chmod +x /usr/local/sbin/funmary-update.sh
```

### 3.2 環境変数ファイルを作る

`/etc/funmary/funmary.env` を、リポジトリの [`.env.example`](../.env.example) と同じ形式で作ります。まず空のファイルを置きます。

```sh
sudo touch /etc/funmary/funmary.env
sudo chown funmary:funmary /etc/funmary/funmary.env
sudo chmod 600 /etc/funmary/funmary.env
```

主な変数は次のとおりです (すべての変数と説明は [`.env.example`](../.env.example) にあります)。

| 変数                                                                        | 内容                                                                                                              |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ORIGIN`                                                                    | 公開 URL。例: `https://funmary.example.com`                                                                       |
| `PORT`                                                                      | 待ち受けるポート。既定は `28461` (nginx から転送するので、変えなくてよい)                                         |
| `SESSION_SECRET`、`ENCRYPTION_KEY`、`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` | 鍵。あとで `funmary-admin init` が生成する                                                                        |
| `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`                                  | 2.3 で作った OAuth クライアントの値                                                                               |
| `ALLOWED_EMAIL_DOMAINS`                                                     | ログインを許すメールアドレスのドメイン。大学のドメインを書く                                                      |
| `REGISTRATION`                                                              | 新規登録の方式。最初は `invite` (招待コードが要る) を勧める                                                       |
| `ADMIN_EMAILS`                                                              | 管理者にするメールアドレス (自分のアドレスを書く)                                                                 |
| `PORTAL_USER_ID`、`PORTAL_PASSWORD`                                         | 2.4 の学生ポータルのアカウント                                                                                    |
| `ADMIN_DISCORD_WEBHOOK_URL` か `DISCORD_BOT_TOKEN`/`DISCORD_GUILD_ID`       | 管理用の通知の送り先 (任意)                                                                                       |
| `OPERATOR_NAME`、`OPERATOR_URL`                                             | 運営者としてフッターに出す名前と連絡先 (任意。両方書くか、両方空にする)                                           |
| `CONTACT_EMAIL`                                                             | 問い合わせ先のメールアドレス。「このアプリについて」に出す (任意)                                                 |
| `BRAND_DIR`                                                                 | ロゴ、アイコン、URL を共有したときの画像を差し替えるディレクトリ (必須。次の「ロゴとアイコンを差し替える」を参照) |
| `ADDRESS_HEADER`、`XFF_DEPTH`                                               | nginx など、リバースプロキシ越しに利用者の IP アドレスを得る設定。この手順のとおりなら `X-Forwarded-For` と `1`   |

これらのうち、ドメインや OAuth の値、学生ポータルのアカウントは自分で書き、鍵は次の手順で生成します。

#### ロゴとアイコンを差し替える

Funmary のロゴとアイコンは、コードのライセンスの対象外です ([LICENSE-ASSETS](../LICENSE-ASSETS))。セルフホストでは、自分の画像に差し替えてください。

1. 画像を置くディレクトリを作る (例: `/etc/funmary/brand`)
2. 次の名前で、自分の画像を置く。置いていない名前は、同梱の画像が使われるので、すべて置く

   | 名前                              | 大きさ           | 使うところ                                                                   |
   | --------------------------------- | ---------------- | ---------------------------------------------------------------------------- |
   | `icon.svg`、`icon-dark.svg`       | 正方形           | ブラウザのタブ (端末の設定が明るいとき、暗いとき)                            |
   | `icon-192.png`、`icon-512.png`    | 192x192、512x512 | ホーム画面に追加したとき                                                     |
   | `icon-maskable-512.png`           | 512x512          | ホーム画面に追加したとき (端末が丸などに切り抜く。中身は中央の 80% に収める) |
   | `apple-touch-icon.png`            | 180x180          | iPhone のホーム画面                                                          |
   | `og-image.png`                    | 1200x630         | URL を共有したときのカード                                                   |
   | `logo-light.svg`、`logo-dark.svg` | 横長             | 画面の上部と紹介の画面のロゴ (明るい画面、暗い画面)                          |

3. `/etc/funmary/funmary.env` に `BRAND_DIR=/etc/funmary/brand` を書き、`funmary` のユーザーが読めるようにする

画像は `/brand/<名前>` で配られます。差し替えたら、`systemctl restart funmary` は要りません (次に読まれたときから使われます。ブラウザは 1 日ほど覚えているので、すぐ確かめるときは再読み込みします)。

### 3.3 最初のリリースを取得する

```sh
sudo /usr/local/sbin/funmary-update.sh build-<コミットのハッシュ>
```

コミットのハッシュは、GitHub の Releases のページで確かめます。初回は systemd の unit がまだないので、リリースを展開して `/opt/funmary/current` に配置するだけで、起動はしません。

### 3.4 鍵を生成する

リリースに含まれる `funmary-admin` コマンドで、環境変数ファイルの空の鍵を埋めます。

```sh
sudo /usr/local/bin/funmary-admin init --file=/etc/funmary/funmary.env
```

Google の値 (`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`) と、ドメインなど自分で決める値は、このあとエディタで書き足してください。値のある行は上書きされません。

### 3.5 systemd の unit を置く

`deploy/` にある unit ファイルを配置します (`update.sh` を使うと自動で `/opt/funmary/current/deploy/` から取得できるので、リリースの中から取ってもかまいません)。

```sh
sudo cp /opt/funmary/current/deploy/funmary.service /etc/systemd/system/
sudo cp /opt/funmary/current/deploy/funmary-backup.service /etc/systemd/system/
sudo cp /opt/funmary/current/deploy/funmary-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now funmary.service
sudo systemctl enable --now funmary-backup.timer
```

`funmary.service` は、`StateDirectory=funmary` で `/var/lib/funmary` を作り、DB とバックアップをそこに置きます。`funmary-backup.timer` は、毎日日本時間 4 時にバックアップを取り、古い日ごとのバックアップは 14 個まで残します。

### 3.6 nginx を設定する

[`deploy/nginx/funmary.conf`](../deploy/nginx/funmary.conf) を参考に、`/etc/nginx/sites-available/funmary.conf` を作ります。`server_name` を自分のドメインに書き換えてください。

```sh
sudo ln -s /etc/nginx/sites-available/funmary.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

証明書は [certbot](https://certbot.eff.org/) で取得します。取得すると、certbot が 443 番の設定と、80 番から 443 番への転送を書き足します。

```sh
sudo certbot --nginx -d funmary.example.com
```

### 3.7 起動を確かめる

```sh
curl https://funmary.example.com/healthz
```

`{"status":"ok"}` が返れば、起動できています。ブラウザで開き、Google でログインできるかも確かめてください (`REGISTRATION=invite` のままだと、招待コードが要ります。招待コードの発行は 4.3 を参照)。

`{"status":"unavailable"}` が返る、または応答がないときは `journalctl -u funmary -n 50` でログを確かめます。

### 3.8 学年暦と授業時間割を取り込む

学生ポータルからは休講などの変更しか取れないので、学期の期間や、曜日と時限の対応表は、大学が配る PDF から別に取り込みます。

1. 大学の公式サイトから、学年暦と、前期・後期の授業時間割の PDF を入手する。
2. 管理者としてログインし、設定の「学年暦」または「授業時間割の取り込み」の画面から PDF を上げる。読み取った内容を確かめてから取り込める。
3. 管理用コマンドでも取り込める (`funmary-admin calendar import <PDF>` と `funmary-admin timetable import <PDF>`。どちらも `--apply` を付けるまでは確かめるだけで、DB には書き込まない)。

学年暦は、大学サイトからの自動取得も月に 1 回行われます (内容が変わったときだけ取り込む)。

## 4. 運用

### 4.1 更新

新しいリリースが出たら、同じコマンドで更新します。

```sh
sudo /usr/local/sbin/funmary-update.sh build-<新しいコミットのハッシュ>
```

`update.sh` は、取得したファイルの sha256 を確かめてから展開し、アプリを再起動して `/healthz` が応答するかを確かめます。応答しなければ、自動で前の版に戻します (前の版が起動できなくなることはありません)。古いリリースは、直近 3 つを残して消えます。

手で前の版に戻したいときは、同じコマンドに前の版のハッシュを指定します。

**任意: リリースのたびに自動で反映する** — このリポジトリを [フォーク](https://github.com/funmary-app/funmary/fork) して使っている場合は、GitHub Actions からリリースのたびに自動で反映させられます。反映専用のユーザーと、そのユーザーでしか使えない SSH の鍵を用意し、`command=` で `funmary-update` だけを実行できるように制限します。

```sh
sudo useradd --system --shell /bin/sh funmary-deploy
sudo -u funmary-deploy mkdir -p /home/funmary-deploy/.ssh
echo 'command="sudo /usr/local/bin/funmary-update",no-agent-forwarding,no-port-forwarding,no-X11-forwarding ssh-ed25519 AAAA...' \
  | sudo -u funmary-deploy tee /home/funmary-deploy/.ssh/authorized_keys
sudo -u funmary-deploy chmod 600 /home/funmary-deploy/.ssh/authorized_keys
```

`ssh-ed25519 AAAA...` の部分は、GitHub Actions 用に新しく作った鍵ペアの公開鍵に置き換えます。`funmary-deploy` が `sudo` で `funmary-update` を無入力で実行できるよう、`visudo` で `funmary-deploy ALL=(root) NOPASSWD: /usr/local/bin/funmary-update` も設定します。あとは、フォークしたリポジトリの Settings から `production` という Environment を作り、secret に `DEPLOY_HOST` (VPS のホスト名)、`DEPLOY_SSH_KEY` (秘密鍵)、`DEPLOY_KNOWN_HOSTS` (`ssh-keyscan` で得たホスト鍵) を設定すれば、`Release` ワークフローの完了後に自動で反映されます。使わないなら、この設定は不要です。

**新しい環境変数が増えたとき** — 更新のたびに `.env.example` を見比べる代わりに、次のどちらかで環境変数ファイルの並びを `.env.example` に合わせられます。どちらも、値のある行の値は変えず、足りない鍵を `.env.example` の位置に空のまま足し、`.env.example` にない鍵は末尾にまとめて残します (消しません)。書き換える前に、元の内容を `<ファイル>.bak.<日時>` として残します。

VPS にログインしているなら、`funmary-admin` を直接使います。

```sh
sudo /usr/local/bin/funmary-admin align-env --file=/etc/funmary/funmary.env
```

リポジトリの手元の環境からは、`pnpm env:upload` で、SSH で入るだけで済ませられます (並びを揃えたあと、手元の `.env` にあってリモートと値が違う、またはリモートにない鍵があれば、1 つずつ上書きするか確認されます)。接続先は、コマンドの引数ではなく `.env.ssh` に書きます (シェルの履歴に接続先や鍵の場所を残さないため)。

```sh
cp .env.ssh.example .env.ssh
# .env.ssh を開き、SSH_HOST (例: root@funmary.example.com) などを書く

pnpm env:upload
```

反映専用の制限された鍵 (`funmary-deploy`) は使わず、自分の SSH 鍵と `sudo` を使います。パスフレーズ付きの鍵なら、接続のたびに端末で聞かれます (`pnpm env:upload` では、読むときと書くときの 2 回)。先に `ssh-add` で `ssh-agent` に登録すれば、聞かれません。

接続は公開鍵認証だけで行い、パスワード認証には切り替えません。鍵が見つからなければ、パスワードを聞かずに止まります。`.env.ssh` の `SSH_HOST` には、`~/.ssh/config` の Host 名も書けます (そのときは `User` と `IdentityFile` をその設定から読みます)。`~/.ssh/config` の設定が当たらないときは、`SSH_KEY` に秘密鍵のパスを書きます。原因が分からないときは、`ssh -v` で同じ宛先に手で接続してみます。VPS の sshd では、パスワード認証を切っておくのがよいです (`PasswordAuthentication no`)。

`pnpm env:upload` で値を上書きしたときは、最後にいま再起動するか聞かれ、`y` と答えると再起動して、動いているかまで確かめます。再起動だけをしたいときや、再起動を後回しにしたときは、`pnpm vps:restart` を使います (VPS の上では `systemctl restart funmary`)。

### 4.2 バックアップと復元

バックアップは `funmary-backup.timer` が毎日自動で取ります。手で取りたいときは次のとおりです。

```sh
sudo /usr/local/bin/funmary-admin backup
```

復元する前には、アプリを止めます。

```sh
sudo systemctl stop funmary
sudo /usr/local/bin/funmary-admin restore <バックアップのファイル>
sudo systemctl start funmary
```

戻す前の DB は、消さずに残ります (メッセージに出る場所を確認してください)。

### 4.3 招待コード

`REGISTRATION=invite` のときは、管理者が招待コードを発行しないと、誰も登録できません。

```sh
sudo /usr/local/bin/funmary-admin invite create --uses 5 --days 30 --note "テスター向け"
```

コードは、この実行時にしか表示されません (DB にはハッシュだけを保存します)。渡したい人に、コードと、登録の URL (`https://funmary.example.com/signup?code=<コード>`) を伝えてください。ログインしている管理者や、発行を許可された利用者は、設定の画面からも発行できます。

### 4.4 監視

- `/healthz` を、外部の監視サービス (UptimeRobot など) で定期的に確認することを勧めます。
- 環境変数 `HEARTBEAT_URL` に [healthchecks.io](https://healthchecks.io/) などの URL を設定すると、定期処理 (休講の取得など) が動くたびに、その URL への通知が届きます。定期処理が止まったことに気づけます。
- `ADMIN_DISCORD_WEBHOOK_URL` か `DISCORD_BOT_TOKEN`/`DISCORD_GUILD_ID` を設定すると、取得元の不調や、反映の結果などが Discord に届きます。

### 4.5 ログの見方

```sh
journalctl -u funmary -f          # リアルタイムで見る
journalctl -u funmary -n 100      # 直近 100 行
journalctl -u funmary --since "1 hour ago"
```

既定のログの形式はテキストです。`LOG_FORMAT=json` にすると、1 行 1 つの JSON になり、外部のログ収集サービスに送りやすくなります。既定の詳しさ (`LOG_LEVEL`) は、本番では `info` です。

### 4.6 取得元の状態を見る

```sh
sudo /usr/local/bin/funmary-admin sources status
```

学生ポータル、公開シラバス、祝日のそれぞれについて、最後に成功した時刻と、連続で失敗している回数が分かります。管理者としてログインした画面の「取得元と実行履歴」でも、同じ内容が見られます。

定期処理を、決まった時刻を待たずに 1 回動かすこともできます。管理画面の「取得元と実行履歴」の「今すぐ動かす」でも動かせます (こちらはサーバーの中で動くので、同じ処理が重なりません)。予定のまとめの送信 (`send-daily-digest`) は、利用者に二重に送らないよう、管理画面からだけ動かせます。

```sh
sudo /usr/local/bin/funmary-admin job run import-syllabus
```

学生ポータルからの取得 (`scrape-portal`) は、手で動かしても、前の取得から 60 分たっていなければ取得しません。管理画面の同じページには、直近 24 時間の応答時間の分布も出ます (サーバーのメモリにだけ記録するので、再起動すると消えます)。

### 4.7 利用者の管理

```sh
sudo /usr/local/bin/funmary-admin user list                                  # 一覧
sudo /usr/local/bin/funmary-admin user promote <メールアドレス>               # 管理者にする
sudo /usr/local/bin/funmary-admin user promote <メールアドレス> --role moderator
sudo /usr/local/bin/funmary-admin user promote <メールアドレス> --role user   # 一般に戻す
sudo /usr/local/bin/funmary-admin user suspend <メールアドレス>               # 利用を停止する
sudo /usr/local/bin/funmary-admin user unsuspend <メールアドレス>             # 停止を解く
```

利用者は、一度ログインして登録を済ませている必要があります。モデレーターは、監査ログと、曜日と時限の確認待ちを見られます。利用を停止すると、その人のログイン中のセッションもすべて消えます。`ADMIN_EMAILS` にある人は、ログインのたびに管理者に戻るので、管理者から外すときは `ADMIN_EMAILS` からも外してください。権限の変更と停止は、監査ログに残り、管理用の Discord の `users` に知らせます (メールアドレスは載せません)。

## 5. 大学のサービスとのかかわり

- Funmary が大学の学生ポータルに接続するのは、休講などを確かめる定期処理だけです。この定期処理は、1 日に 3 回 (日本時間 7 時、12 時、18 時) しか動かず、それより短い間隔で接続することはありません (`SOURCES_DISABLED` で個別の取得元を止めることはできますが、間隔を今より短くする設定はありません)。
- 学生ポータルのアカウント (3.4 で設定したもの) のパスワードは、環境変数ファイルにだけ置かれ、暗号化して DB に保存されます。画面や管理用コマンドの出力には出ません。
- 授業の曜日と時限、教室は、学生ポータルからは自動で取れないため、利用者どうしが登録して共有する仕組みです。学年暦と授業時間割の PDF は、大学の公式サイトから、管理者が手で取り込みます (3.8)。
- Funmary は大学の公式サービスではありません。運営者としての名前と連絡先を、環境変数 `OPERATOR_NAME`/`OPERATOR_URL` で設定すると、画面のフッターに出せます。設定しない場合、Funmary はソースコードへのリンクだけを出します。

## 困ったときは

[GitHub の Issue](https://github.com/funmary-app/funmary/issues) で聞いてください。セキュリティ上の問題は、[SECURITY.md](../SECURITY.md) の方法で報告してください。
