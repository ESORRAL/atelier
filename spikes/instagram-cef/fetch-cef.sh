#!/usr/bin/env bash
# Installs the CEF 156.0.26 minimal binary into $CEF_PATH the way cef-dll-sys's build.rs would.
# shortcut: download-cef 3.0.0 aborts on the CDN index (>10 MB ureq body limit); drop this script once fixed upstream.
set -euo pipefail
: "${CEF_PATH:?set CEF_PATH, e.g. \$HOME/.cache/atelier-cef}"
NAME='cef_binary_156.0.26+g8ea0c73+chromium-156.0.8078.88_linux64_minimal'
SHA1=cacfbb7d7261fea682fb67c108de7e4347519ff7  # from https://cef-builds.spotifycdn.com/index.json
DIR="$CEF_PATH/156.0.26"; OUT="$DIR/cef_linux_x86_64"
[ -d "$OUT" ] && { echo "already installed: $OUT"; exit 0; }
mkdir -p "$DIR"
[ -f "$DIR/$NAME.tar.bz2" ] || curl -sSf -o "$DIR/$NAME.tar.bz2" \
  "https://cef-builds.spotifycdn.com/${NAME//+/%2B}.tar.bz2"
echo "$SHA1  $DIR/$NAME.tar.bz2" | sha1sum -c -
X=$(mktemp -d); trap 'rm -rf "$X"' EXIT
tar -xjf "$DIR/$NAME.tar.bz2" -C "$X"
mv "$X/$NAME/Release" "$OUT"
mv "$X/$NAME"/Resources/* "$OUT"/
mv "$X/$NAME"/{CMakeLists.txt,cmake,include,libcef_dll,CREDITS.html} "$OUT"/
printf '{"type":"minimal","name":"%s.tar.bz2","sha1":"%s"}\n' "$NAME" "$SHA1" >"$OUT/archive.json"
echo "installed: $OUT"
