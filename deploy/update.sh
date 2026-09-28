#!/bin/bash
# リリースを取得して切り替える。root で動かす (設計書 20.6)。
# 使い方: update.sh <版>。版は build-<hash> か v<数字>.<数字>.<数字>。
# 終了コード: 0 = 成功か変化なし、1 = 失敗 (切り戻した)、2 = 使い方の誤り
#
# FUNMARY_ で始まる変数は、deploy/tests/update.test.sh が、本物の VPS を使わずに動きを確かめるためのもの。
# 本番では、どれも設定しない (sudo が環境変数を捨てるので、SSH の鍵を持つ人が設定することもできない)。
set -euo pipefail

REPO="${FUNMARY_REPO:-funmary-app/funmary}"
DOWNLOAD_BASE="${FUNMARY_DOWNLOAD_BASE:-https://github.com/$REPO/releases/download}"
BASE="${FUNMARY_BASE:-/opt/funmary}"
ENV_FILE="${FUNMARY_ENV_FILE:-/etc/funmary/funmary.env}"
BIN_DIR="${FUNMARY_BIN_DIR:-/usr/local/bin}"
SBIN_DIR="${FUNMARY_SBIN_DIR:-/usr/local/sbin}"
LOCK_FILE="${FUNMARY_LOCK_FILE:-/run/funmary-update.lock}"
NPM="${FUNMARY_NPM:-/usr/bin/npm}"
KEEP=3
HEALTH_TIMEOUT="${FUNMARY_HEALTH_TIMEOUT:-30}"

version="${1:-}"
if ! [[ "$version" =~ ^(build-[0-9a-f]{7,40}|v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?)$ ]]; then
  echo "使い方: update.sh <build-hash か v数字.数字.数字>" >&2
  exit 2
fi

# 同時に 2 つ動かさない
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "別の反映が動いています" >&2; exit 1; }

# 環境変数ファイルから 1 つの値を読む (source しないので、中身は実行されない)。
# ファイルが読めなくても、空を返して続ける (set -e と pipefail で、ここで止まらないように)
env_value() {
  { sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null || true; } | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/'
}

# 管理用の Discord に知らせる。失敗しても反映は止めない。Webhook の URL は画面にもログにも出さない
notify() {
  local url
  url="$(env_value ADMIN_DISCORD_WEBHOOK_URL)"
  [ -n "$url" ] || return 0
  curl -fsS --max-time 10 -H 'Content-Type: application/json' \
    -d "{\"content\":\"$1\"}" "$url" >/dev/null 2>&1 || true
}

port="$(env_value PORT)"
port="${port:-28461}"
HEALTH_URL="${FUNMARY_HEALTH_URL:-http://127.0.0.1:${port}/healthz}"
healthy() {
  curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

release_dir="$BASE/releases/$version"
if [ ! -d "$release_dir" ]; then
  url="$DOWNLOAD_BASE/$version"
  echo "$version を取得します"
  curl -fsSL --retry 3 -o "$tmp/funmary.tar.gz" "$url/funmary-$version.tar.gz"
  curl -fsSL --retry 3 -o "$tmp/funmary.tar.gz.sha256" "$url/funmary-$version.tar.gz.sha256"
  curl -fsSL --retry 3 -o "$tmp/build-hash.txt" "$url/build-hash.txt"

  # チェックサムのファイル名を、保存した名前に合わせて確かめる
  expected="$(cut -d' ' -f1 "$tmp/funmary.tar.gz.sha256")"
  echo "$expected  $tmp/funmary.tar.gz" | sha256sum -c --quiet - \
    || { echo "チェックサムが合いません。取得したファイルを使いません" >&2; exit 1; }

  mkdir -p "$tmp/extract"
  tar -xzf "$tmp/funmary.tar.gz" -C "$tmp/extract"
  staged="$tmp/extract/funmary-$version"
  [ -f "$staged/server.js" ] || { echo "リリースの中身が想定と違います" >&2; exit 1; }
  cp "$tmp/build-hash.txt" "$staged/.build-hash"

  # better-sqlite3 を入れる (ビルド済みのファイルを取得する)。失敗したら、途中の状態を残さない
  (cd "$staged" && "$NPM" install --omit=dev --no-audit --no-fund --loglevel=error)
  # アプリ自身が自分のコードを書き換えられないように、root の持ち物にする (root で動かしているときだけ)
  if [ "$(id -u)" -eq 0 ]; then chown -R root:root "$staged"; fi
  chmod -R go-w "$staged"
  mkdir -p "$BASE/releases"
  mv "$staged" "$release_dir.new"
  mv "$release_dir.new" "$release_dir"
fi

# 管理用コマンドと、反映の入口を、この版のものに置き換える。install は新しいファイルに差し替えるので、動いていても安全
install -d -m 755 "$BIN_DIR" "$SBIN_DIR"
install -m 755 "$release_dir/deploy/funmary-admin" "$BIN_DIR/funmary-admin"
install -m 755 "$release_dir/deploy/funmary-update" "$SBIN_DIR/funmary-update"

# unit がまだなければ初回。展開と、上の配置だけで終える (systemd の登録は手で行う)
if ! systemctl cat funmary.service >/dev/null 2>&1; then
  ln -sfn "$release_dir" "$BASE/current"
  echo "初回の配置を終えました。systemd の unit を置いて起動してください"
  exit 0
fi

previous="$(readlink -f "$BASE/current" || true)"
if [ "$previous" = "$release_dir" ] && [ -f "$previous/.build-hash" ]; then
  echo "すでにこの版です"
  exit 0
fi
# ビルド結果が今の版と同じなら、再起動しない
if [ -n "$previous" ] && [ -f "$previous/.build-hash" ] && [ -f "$release_dir/.build-hash" ] \
  && cmp -s "$previous/.build-hash" "$release_dir/.build-hash"; then
  ln -sfn "$release_dir" "$BASE/current"
  echo "ビルド結果が同じなので、再起動しません"
  notify "Funmary: $version はビルド結果が今の版と同じなので、そのまま切り替えました (変化なし)"
  exit 0
fi

ln -sfn "$release_dir" "$BASE/current"
systemctl restart funmary || true

ok=0
for _ in $(seq "$HEALTH_TIMEOUT"); do
  if systemctl is-active --quiet funmary && healthy; then
    ok=1
    break
  fi
  sleep 1
done

if [ "$ok" -ne 1 ]; then
  echo "$version が起動しなかったので、前の版に戻します" >&2
  journalctl -u funmary -n 20 --no-pager >&2 || true
  if [ -n "$previous" ] && [ -d "$previous" ]; then
    ln -sfn "$previous" "$BASE/current"
    systemctl restart funmary || true
  fi
  notify "Funmary: $version の反映に失敗したので、前の版に切り戻しました。journalctl -u funmary で確かめてください"
  exit 1
fi

# 古いリリースを、新しいものから KEEP 個だけ残す (今の版と切り戻し先は必ず残る)
# shellcheck disable=SC2012
ls -1dt "$BASE"/releases/*/ | tail -n +$((KEEP + 1)) | while read -r old; do
  old="${old%/}"
  [ "$old" = "$(readlink -f "$BASE/current")" ] && continue
  rm -rf "$old"
done

echo "$version に切り替えました"
notify "Funmary: $version に切り替えました"
