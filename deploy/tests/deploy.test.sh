#!/bin/bash
# deploy/update.sh と deploy/funmary-update の動きを、本物の VPS を使わずに確かめる。Linux で動かす。
# systemctl と npm は偽物に差し替え、ダウンロードは file:// で行う。root でなくても動く。
# 使い方: bash deploy/tests/deploy.test.sh   (CI でも動かす)
set -uo pipefail

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

passed=0
failed=0
check() { # check <説明> <コマンド...>: コマンドが成功すれば合格
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    passed=$((passed + 1))
    echo "  ok   $name"
  else
    failed=$((failed + 1))
    echo "  FAIL $name"
  fi
}
equals() { [ "$1" = "$2" ]; }

# --- 偽物の道具 ---------------------------------------------------------------

stubs="$work/stubs"
mkdir -p "$stubs"
# systemctl: 呼ばれた記録を残す。unit があるかは、$STUB_DIR/unit の有無で決める
cat > "$stubs/systemctl" <<'EOF'
#!/bin/sh
echo "systemctl $*" >> "$STUB_DIR/calls"
case "$1" in
  cat) [ -f "$STUB_DIR/unit" ] ;;
  is-active) exit 0 ;;
  *) exit 0 ;;
esac
EOF
printf '#!/bin/sh\nexit 0\n' > "$stubs/journalctl"
cat > "$stubs/npm" <<'EOF'
#!/bin/sh
mkdir -p node_modules/better-sqlite3
echo "npm $*" >> "$STUB_DIR/calls"
command -v node > "$STUB_DIR/npm-node"
EOF
# npm と同じ場所の node と、PATH で先に見つかる別の node (sudo の /usr/local/bin にあるもの)
printf '#!/bin/sh\nexit 0\n' > "$stubs/node"
other_node_dir="$work/other-node"
mkdir -p "$other_node_dir"
printf '#!/bin/sh\nexit 0\n' > "$other_node_dir/node"
chmod +x "$stubs"/* "$other_node_dir/node"

# --- リリースを作る ------------------------------------------------------------

# make_release <版> <ビルド結果の hash>: $work/dl/<版>/ に、tar.gz、チェックサム、hash を作る
make_release() {
  local version="$1" hash="$2" root="$work/build-$1"
  rm -rf "$root"
  mkdir -p "$root/funmary-$version/deploy" "$work/dl/$version"
  echo "// server" > "$root/funmary-$version/server.js"
  echo "// cli" > "$root/funmary-$version/cli.js"
  echo '{"type":"module"}' > "$root/funmary-$version/package.json"
  cp "$deploy_dir/funmary-admin" "$deploy_dir/funmary-update" "$deploy_dir/update.sh" "$root/funmary-$version/deploy/"
  (cd "$root" && tar -czf "$work/dl/$version/funmary-$version.tar.gz" "funmary-$version")
  (cd "$work/dl/$version" && sha256sum "funmary-$version.tar.gz" > "funmary-$version.tar.gz.sha256")
  echo "$hash" > "$work/dl/$version/build-hash.txt"
}

# --- 1 つの場面 (それぞれ、新しい場所で始める) ----------------------------------

n=0
new_scene() {
  n=$((n + 1))
  scene="$work/scene$n"
  mkdir -p "$scene"/{opt,etc,bin,sbin,stub}
  export STUB_DIR="$scene/stub"
  export FUNMARY_BASE="$scene/opt"
  export FUNMARY_ENV_FILE="$scene/etc/funmary.env"
  export FUNMARY_BIN_DIR="$scene/bin"
  export FUNMARY_SBIN_DIR="$scene/sbin"
  export FUNMARY_LOCK_FILE="$scene/lock"
  export FUNMARY_NPM="$stubs/npm"
  export FUNMARY_DOWNLOAD_BASE="file://$work/dl"
  export FUNMARY_HEALTH_URL="file://$scene/stub/healthy"
  export FUNMARY_HEALTH_TIMEOUT=2
  export PATH="$stubs:$PATH"
  : > "$FUNMARY_ENV_FILE"
  : > "$STUB_DIR/calls"
}
update() { bash "$deploy_dir/update.sh" "$@"; }
current() { readlink "$FUNMARY_BASE/current" | sed 's#.*/##'; }
restarts() { grep -c 'systemctl restart' "$STUB_DIR/calls" || true; }

make_release build-aaaaaaa hash-a
make_release build-bbbbbbb hash-b
make_release build-ccccccc hash-b   # 中身の hash が bbbbbbb と同じ (ビルド結果が同じ)
make_release build-ddddddd hash-d
make_release build-eeeeeee hash-e

echo "update.sh: 初回の配置 (systemd の unit がまだない)"
new_scene
update build-aaaaaaa >/dev/null 2>&1
check "終了コード 0 で終わる" equals "$?" 0
check "リリースを展開し、current がそれを指す" equals "$(current)" build-aaaaaaa
check "npm install (better-sqlite3) を、展開した中で行う" test -d "$FUNMARY_BASE/releases/build-aaaaaaa/node_modules/better-sqlite3"
check "funmary-admin と funmary-update を置き、実行できる" test -x "$FUNMARY_BIN_DIR/funmary-admin" -a -x "$FUNMARY_SBIN_DIR/funmary-update"
check "再起動はしない (unit がないので)" equals "$(restarts)" 0
check "ビルド結果の hash を、リリースの中に残す" equals "$(cat "$FUNMARY_BASE/releases/build-aaaaaaa/.build-hash")" hash-a

echo "update.sh: npm は、同じ場所にある node で動かす"
new_scene
PATH="$other_node_dir:$PATH" update build-aaaaaaa >/dev/null 2>&1
check "PATH で先に見つかる node ではなく、npm と同じ場所の node を使う" equals "$(cat "$STUB_DIR/npm-node")" "$stubs/node"

echo "update.sh: unit があるときの切り替え"
new_scene
update build-aaaaaaa >/dev/null 2>&1
touch "$STUB_DIR/unit" "$STUB_DIR/healthy"
update build-bbbbbbb >/dev/null 2>&1
check "終了コード 0 で終わる" equals "$?" 0
check "current が新しい版を指す" equals "$(current)" build-bbbbbbb
check "1 回だけ再起動する" equals "$(restarts)" 1
check "前の版も残す (切り戻し先)" test -d "$FUNMARY_BASE/releases/build-aaaaaaa"

echo "update.sh: 起動しなかったときは、前の版に戻す"
new_scene
update build-aaaaaaa >/dev/null 2>&1
touch "$STUB_DIR/unit"          # healthy がないので、/healthz が応答しない
update build-bbbbbbb >/dev/null 2>&1
check "終了コード 1 で終わる (失敗を Actions に返す)" equals "$?" 1
check "current が前の版に戻る" equals "$(current)" build-aaaaaaa
check "切り替えと切り戻しで、2 回再起動する" equals "$(restarts)" 2

echo "update.sh: ビルド結果が同じなら、再起動しない"
new_scene
update build-bbbbbbb >/dev/null 2>&1
touch "$STUB_DIR/unit" "$STUB_DIR/healthy"
update build-ccccccc >/dev/null 2>&1
check "終了コード 0 で終わる" equals "$?" 0
check "current は新しい版になる" equals "$(current)" build-ccccccc
check "再起動しない" equals "$(restarts)" 0

echo "update.sh: すでにその版なら、何もしない"
new_scene
update build-aaaaaaa >/dev/null 2>&1
touch "$STUB_DIR/unit" "$STUB_DIR/healthy"
update build-aaaaaaa >/dev/null 2>&1
check "終了コード 0 で終わり、再起動しない" equals "$(restarts)" 0

echo "update.sh: チェックサムが合わなければ、使わない"
new_scene
make_release build-fffffff hash-f
echo "0000000000000000000000000000000000000000000000000000000000000000  funmary-build-fffffff.tar.gz" > "$work/dl/build-fffffff/funmary-build-fffffff.tar.gz.sha256"
update build-fffffff >/dev/null 2>&1
check "失敗で終わる" test "$?" -ne 0
check "展開しない" test ! -e "$FUNMARY_BASE/releases/build-fffffff"
check "current を作らない" test ! -e "$FUNMARY_BASE/current"

echo "update.sh: 版の名前の形が違えば、断る"
new_scene
for bad in "" "latest" "build-xyz" "../../etc" "build-aaaaaaa;id" 'v1.2'; do
  update "$bad" >/dev/null 2>&1
  check "断る (終了コード 2): '$bad'" equals "$?" 2
done

echo "update.sh: 古いリリースは 3 つまで残す"
new_scene
touch "$STUB_DIR/unit" "$STUB_DIR/healthy"
for v in build-aaaaaaa build-bbbbbbb build-ddddddd build-eeeeeee; do
  update "$v" >/dev/null 2>&1
  sleep 1   # ディレクトリの更新時刻をずらす
done
check "current は最後の版" equals "$(current)" build-eeeeeee
check "リリースの数は 3" equals "$(find "$FUNMARY_BASE/releases" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')" 3
check "いちばん古い版が消える" test ! -e "$FUNMARY_BASE/releases/build-aaaaaaa"

echo "update.sh: Bot があれば、管理用コマンドで deploy のチャンネルに送る"
new_scene
printf '#!/bin/sh
echo "$*" >> "%s"
' "$scene/admin-calls" > "$scene/fake-admin"
chmod +x "$scene/fake-admin"
export FUNMARY_ADMIN_CMD="$scene/fake-admin"
echo "DISCORD_BOT_TOKEN=dummy-bot-token-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" > "$FUNMARY_ENV_FILE"
update build-aaaaaaa >/dev/null 2>&1
touch "$STUB_DIR/unit" "$STUB_DIR/healthy"
update build-bbbbbbb >/dev/null 2>&1
check "切り替えを deploy に、info で送る" grep -q -- "^notify --channel deploy --severity info Funmary: build-bbbbbbb に切り替えました$" "$scene/admin-calls"
: > "$scene/admin-calls"
rm "$STUB_DIR/healthy"
update build-ddddddd >/dev/null 2>&1
check "切り戻したことを deploy に、error で送る" grep -q -- "^notify --channel deploy --severity error " "$scene/admin-calls"

echo "update.sh: Bot がなければ、管理用コマンドを呼ばない"
new_scene
printf '#!/bin/sh
echo "$*" >> "%s"
' "$scene/admin-calls" > "$scene/fake-admin"
chmod +x "$scene/fake-admin"
export FUNMARY_ADMIN_CMD="$scene/fake-admin"
update build-aaaaaaa >/dev/null 2>&1
touch "$STUB_DIR/unit" "$STUB_DIR/healthy"
update build-bbbbbbb >/dev/null 2>&1
check "呼ばない" test ! -s "$scene/admin-calls"
unset FUNMARY_ADMIN_CMD

echo "update.sh: 環境変数ファイルがなくても止まらない"
new_scene
rm "$FUNMARY_ENV_FILE"
update build-aaaaaaa >/dev/null 2>&1
check "初回の配置まで進む" equals "$(current)" build-aaaaaaa

# --- funmary-update ------------------------------------------------------------

echo "funmary-update: 版の名前の受け取りと確認"
printf '#!/bin/sh\nprintf "%%s\\n" "$@" > "%s"\n' "$work/received" > "$work/fake-update.sh"
chmod +x "$work/fake-update.sh"
export FUNMARY_UPDATE_SCRIPT="$work/fake-update.sh"
run_update() { sh "$deploy_dir/funmary-update"; }

rm -f "$work/received"
SSH_ORIGINAL_COMMAND=build-abc1234 run_update >/dev/null 2>&1
check "環境変数 SSH_ORIGINAL_COMMAND から受け取る" equals "$(cat "$work/received" 2>/dev/null)" build-abc1234

rm -f "$work/received"
env -u SSH_ORIGINAL_COMMAND sh "$deploy_dir/funmary-update" v1.2.3 >/dev/null 2>&1
check "最初の引数から受け取る" equals "$(cat "$work/received" 2>/dev/null)" v1.2.3

# sudo が環境変数を捨てた場合を再現する: 親のプロセスだけが SSH_ORIGINAL_COMMAND を持つ
rm -f "$work/received"
# (bash -c が最後のコマンドに置き換わらないよう、あとに : を付けて、子のプロセスにする。$0 は bash -c の中で展開する)
# shellcheck disable=SC2016
SSH_ORIGINAL_COMMAND=build-def5678 bash -c 'env -u SSH_ORIGINAL_COMMAND sh "$0"; :' "$deploy_dir/funmary-update" >/dev/null 2>&1
check "sudo が環境変数を捨てても、親のプロセスから受け取る" equals "$(cat "$work/received" 2>/dev/null)" build-def5678

# $(id) は、展開させずに、文字のまま渡す (コマンド置換を仕込まれても実行されないことの確認)
# shellcheck disable=SC2016
for bad in "" "latest" "build-abc" "build-abc1234; rm -rf /" 'build-abc1234$(id)' "build-abc1234 extra" "v1.2" "../build-abc1234" $'build-abc1234\nid'; do
  rm -f "$work/received"
  SSH_ORIGINAL_COMMAND="$bad" run_update >/dev/null 2>&1
  status=$?
  check "断る (終了コード 2) で、update.sh を呼ばない: '${bad//$'\n'/\\n}'" test "$status" -eq 2 -a ! -e "$work/received"
done

echo
echo "合格 $passed 件、失敗 $failed 件"
[ "$failed" -eq 0 ]
