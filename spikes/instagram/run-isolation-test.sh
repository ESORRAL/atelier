#!/usr/bin/env bash
# Automatic isolation test: serves test-page/ locally, loads it in the `pause` window, reads the verdict.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.cargo/bin:$PATH"
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
RUN="run$RANDOM$RANDOM"
TMP=$(mktemp -d)
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory test-page 2>"$TMP/http.log" >/dev/null &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; rm -rf "$TMP"' EXIT
sleep 0.5

PAUSE_URL="http://127.0.0.1:$PORT/pause.html?run=$RUN" ISOLATION_TEST=1 \
  timeout 60 ./target/debug/spike-instagram >"$TMP/app.log" 2>&1 || true

# Decoded server log: one line per request path.
python3 -c 'import sys,urllib.parse,re
for l in open(sys.argv[1]):
    m=re.search(r"\"GET (\S+)",l)
    if m: print(urllib.parse.unquote(m.group(1)))' "$TMP/http.log" >"$TMP/req.log"
echo "--- pause page reports"; grep '^/report' "$TMP/req.log" | sed 's|^/report?||'
echo "--- app"; grep -E 'PROBE|NAVIGATION|NEW_WINDOW|DATA_DIR' "$TMP/app.log"

fail=0
check() { if eval "$2"; then echo "PASS $1"; else echo "FAIL $1"; fail=1; fi; }
calls=$(grep '^PROBE_CALLS' "$TMP/app.log" | cut -d' ' -f2- || true)
check "test ran to completion"          "grep -q '^PROBE_CALLS' '$TMP/app.log'"
check "pause page ran every attempt"    "grep -q 'vector=done' '$TMP/req.log'"
check "main control call reached Rust"  "[[ ,$calls, == *,main,* ]]"
check "no call from pause reached Rust" "! grep -q 'PROBE_REACHED_RUST from=pause' '$TMP/app.log'"
check "pause sees its own cookie"       "grep -q 'vector=cookie-pause&outcome=.*spike=$RUN' '$TMP/req.log'"
check "main store does not see it"      "grep -q 'vector=cookie-main&' '$TMP/req.log' && ! grep -q 'vector=cookie-main&.*$RUN' '$TMP/req.log'"
PAUSE_DIR=$(grep '^PAUSE_DATA_DIR=' "$TMP/app.log" | cut -d= -f2-)
check "pause data dir exists on disk"   "[ -d '$PAUSE_DIR' ] && [ -n \"\$(ls -A '$PAUSE_DIR')\" ]"
echo "    pause data dir: $PAUSE_DIR"; ls "$PAUSE_DIR" | sed 's/^/      /'
check "forbidden page never loaded"     "! grep -q '^/forbidden.html' '$TMP/req.log'"
check "off-allowlist navigation blocked" "grep -q 'NAVIGATION_BLOCKED http://localhost' '$TMP/app.log'"
[ $fail = 0 ] && echo "ISOLATION TEST: PASS" || { echo "ISOLATION TEST: FAIL"; exit 1; }
