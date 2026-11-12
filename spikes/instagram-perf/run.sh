#!/usr/bin/env bash
# One measurement: ./run.sh <label> [VAR=value ...]  (e.g. ./run.sh overlay-open MODE=overlay OPEN=1)
# Serves test-page/, runs the spike 30 s, samples CPU 6..26 s with pidstat (UI process + each WebKit child),
# prints the frame stats the page reports. Run ./make-media.sh once first.
set -euo pipefail
cd "$(dirname "$0")"
LABEL=$1; shift
BIN="${BIN:-${CARGO_TARGET_DIR:-target}/release/spike-instagram-perf}"
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
TMP=$(mktemp -d)
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory test-page 2>"$TMP/http.log" >/dev/null &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; rm -rf "$TMP"' EXIT
sleep 0.3
env CHILD_URL="http://127.0.0.1:$PORT/scroll.html?run=$LABEL&secs=20&scroll=${SCROLL:-1}&audio=${AUDIO:-0}" SECS=30 "$@" \
  timeout 40 "$BIN" >"$TMP/app.log" 2>&1 &
APP=$!
sleep 6
UI=$(pgrep -P $APP)  # $APP is `timeout`
pids=$(pgrep -P "$UI" | tr '\n' ',')
LC_ALL=C pidstat -u -h -p "$UI,${pids%,}" 20 1 | awk -v l="$LABEL" '$3 ~ /^[0-9]+$/ {printf "CPU %s pid=%s %s %%=%s\n", l, $3, $NF, $8}' \
  | sed "s/pid=$UI /pid=ui /" | while read -r l; do
  # The panel's web process is the one that loaded a GStreamer video decoder plugin.
  p=${l#*pid=}; p=${p%% *}
  if [ "$p" != ui ] && grep -qE 'gstreamer-1.0/libgst(va|libav|openh264)' "/proc/$p/maps" 2>/dev/null; then l="$l [panel]"; fi
  echo "$l"
done
wait $APP || true
grep -E '^(ENV|SETTINGS)' "$TMP/app.log" | sort -u | tr '\n' ' '; echo
grep -oE 'GET /report\S+' "$TMP/http.log" | python3 -c 'import sys,urllib.parse; [print("PAGE", urllib.parse.unquote(l.split("?",1)[1].strip())) for l in sys.stdin]'
