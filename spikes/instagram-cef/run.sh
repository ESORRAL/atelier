#!/usr/bin/env bash
# One measurement: ./run.sh <codec|URL> [VAR=value ...]   e.g. ./run.sh vp9 NO_SANDBOX=1
# A codec name serves test-page/ locally; anything else is opened as is (e.g. https://www.instagram.com/reels/).
# Runs the probe 30 s, samples CPU 8..28 s (whole CEF process tree, per process type), prints probe output.
set -euo pipefail
cd "$(dirname "$0")"
WHAT=$1; shift
BIN="${BIN:-${CARGO_TARGET_DIR:-target}/release/spike-instagram-cef}"
TMP=$(mktemp -d)
SERVER=
trap '[ -n "$SERVER" ] && kill $SERVER 2>/dev/null; rm -rf "$TMP"' EXIT
case $WHAT in
  h264|vp9|av1)
    PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
    python3 -m http.server "$PORT" --bind 127.0.0.1 --directory test-page >/dev/null 2>&1 &
    SERVER=$!
    sleep 0.3
    URL="http://127.0.0.1:$PORT/scroll.html?codec=$WHAT&secs=20&scroll=${SCROLL:-1}"; LOCAL=1 ;;
  *) URL=$WHAT; LOCAL= ;;
esac
env LD_LIBRARY_PATH="$(dirname "$BIN")" URL="$URL" LOCAL="$LOCAL" SECS=30 "$@" timeout 45 "$BIN" >"$TMP/app.log" 2>&1 &
APP=$!
sleep 8
ROOT=$(pgrep -P $APP)  # $APP is `timeout`
tree() { echo "$1"; for c in $(pgrep -P "$1"); do tree "$c"; done; }
pids=$(tree "$ROOT" | paste -sd,)
LC_ALL=C pidstat -u -h -p "$pids" 20 1 | awk '$3 ~ /^[0-9]+$/ {print $3, $8}' | while read -r p cpu; do
  t=$(tr '\0' ' ' <"/proc/$p/cmdline" 2>/dev/null | grep -oE -- '--type=[a-z-]+|--utility-sub-type=[a-zA-Z.]+' | tr '\n' ' ' || true)
  echo "CPU ${t:-browser} $cpu"
done | awk '{c=$NF; $NF=""; s[$0]+=c; t+=c} END {for (k in s) printf "CPU %s= %.1f\n", substr(k,5), s[k]; printf "CPU total= %.1f\n", t}'
wait $APP || echo "exit=$?"
grep -vE '^\[|^$' "$TMP/app.log" | sort | uniq -c | sort -rn | head -30
grep -E '^\[.*(ERROR|FATAL)' "$TMP/app.log" | cut -c1-220 | sort | uniq -c | head -10
pgrep -f "$BIN" >/dev/null && echo "LEFTOVER processes: $(pgrep -f "$BIN" | paste -sd' ')" || echo "no leftover process"
