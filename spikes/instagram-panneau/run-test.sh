#!/usr/bin/env bash
# Panel layout + isolation test: serves test-page/ locally, loads it in the `instagram` child webview, reads the verdict.
# Usage: ./run-test.sh [x11]   (x11: run through XWayland, send test keys, capture each phase with xwd into $SHOTS)
#        EXTRA_CAP=window|webview ./run-test.sh   (adds a remote capability, to check the test catches a leak)
set -euo pipefail
cd "$(dirname "$0")"
BIN="${CARGO_TARGET_DIR:-target}/debug/spike-instagram-panneau"
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
RUN="run$RANDOM$RANDOM"
TMP=$(mktemp -d)
SHOTS="${SHOTS:-$TMP}"
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory test-page 2>"$TMP/http.log" >/dev/null &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; rm -rf "$TMP"' EXIT
sleep 0.5

[ "${1:-}" = x11 ] && export GDK_BACKEND=x11 GDK_CORE_DEVICE_EVENTS=1
echo "session: XDG_SESSION_TYPE=${XDG_SESSION_TYPE:-?} GDK_BACKEND=${GDK_BACKEND:-default}"
CHILD_URL="http://127.0.0.1:$PORT/child.html?run=$RUN" ISOLATION_TEST=1 \
  timeout 90 "$BIN" >"$TMP/app.log" 2>&1 &
APP=$!
if [ "${1:-}" = x11 ]; then
  seen=""
  while kill -0 $APP 2>/dev/null; do
    for p in $(grep '^PHASE' "$TMP/app.log" | cut -d' ' -f2); do
      case " $seen " in *" $p "*) ;; *)
        xwd -silent -name 'atelier (spike panneau)' >"$SHOTS/$p.xwd" 2>/dev/null || true
        seen="$seen $p";; esac
    done
    sleep 0.3
  done
fi
wait $APP || true

python3 -c 'import sys,urllib.parse,re
for l in open(sys.argv[1]):
    m=re.search(r"\"GET (\S+)",l)
    if m: print(urllib.parse.unquote(m.group(1)))' "$TMP/http.log" >"$TMP/req.log"
echo "--- child page (attempts)"; grep '^/report' "$TMP/req.log" | grep -v 'vector=state' | sed 's|^/report?||'
echo "--- child page (state changes)"; grep 'vector=state' "$TMP/req.log" | sed 's|^/report?vector=state&outcome=||' | uniq
echo "--- main page (state changes)"; grep '^REPORT main' "$TMP/app.log" | uniq
echo "--- app"; grep -E '^(LAYOUT|SLIDE|CLICK|CYCLES|PHASE|PROBE|NAVIGATION|NEW_WINDOW|EMIT|WEBVIEWS|EXTRA_CAP)' "$TMP/app.log"
echo "--- app errors"; grep -iE 'panick|error' "$TMP/app.log" | head -5 || true

fail=0
check() { if eval "$2"; then echo "PASS $1"; else echo "FAIL $1"; fail=1; fi; }
calls=$(grep '^PROBE_CALLS' "$TMP/app.log" | cut -d' ' -f2- || true)
check "test ran to completion"            "grep -q '^PROBE_CALLS' '$TMP/app.log'"
check "child page ran every attempt"      "grep -q 'vector=done' '$TMP/req.log'"
check "main control call reached Rust"    "[[ ,$calls, == *,main,* ]]"
check "no probe from child reached Rust"  "! grep -q 'PROBE_REACHED_RUST from=instagram' '$TMP/app.log'"
check "no event emitted by child"         "! grep -q '^EMIT_REACHED' '$TMP/app.log'"
check "child created no webview"          "! grep -q '^WEBVIEWS.*evil' '$TMP/app.log'"
check "child sees its own cookie"         "grep -q 'vector=cookie-child&outcome=.*spike=$RUN' '$TMP/req.log'"
check "main store does not see it"        "grep -q 'vector=cookie-main&' '$TMP/req.log' && ! grep -q 'vector=cookie-main&.*$RUN' '$TMP/req.log'"
check "forbidden page never loaded"       "! grep -q '^/forbidden.html' '$TMP/req.log'"
check "off-allowlist navigation blocked"  "grep -q 'NAVIGATION_BLOCKED http://localhost' '$TMP/app.log'"
check "panel at rail+top bar, 420 wide"    "grep -q '^LAYOUT opened .*child 56,56 420x584 visible=true' '$TMP/app.log'"
check "panel follows window resize"       "grep -q '^LAYOUT resized .*child 56,56 420x444 visible=true' '$TMP/app.log'"
echo "--- frames per 200 ms slide (count frames=N)"; grep "^SLIDE" "$TMP/app.log" | cut -d" " -f3 | sort | uniq -c
check "slide animated, not a jump (>= 3 frames)" "grep '^SLIDE' '$TMP/app.log' | awk '{split(\$3,a,\"=\"); if (a[2]<3) bad=1} END {exit bad}'"
check "41 slides done (20 cycles)"        "[ \$(grep -c '^SLIDE' '$TMP/app.log') -ge 41 ]"
if [ "${1:-}" = x11 ]; then
  # Synthetic keys (XSendEvent) need GDK_CORE_DEVICE_EVENTS=1: GTK ignores them on XInput2.
  # Synthetic clicks proved unreliable (delivered once, then never): clicks are checked by hand.
  check "key goes to focused child"         "grep -q 'vector=key&outcome=k' '$TMP/req.log'"
  check "key goes back to main"             "grep -q '^REPORT main key=m' '$TMP/app.log'"
  echo "screenshots: $SHOTS"
fi
[ $fail = 0 ] && echo "ISOLATION TEST: PASS" || { echo "ISOLATION TEST: FAIL"; exit 1; }
