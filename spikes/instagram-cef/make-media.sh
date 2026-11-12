#!/usr/bin/env bash
# Local test media (not versioned): 3 looping 720x1280 30 fps reels per codec (H.264, VP9, AV1) + 10 large JPEGs.
set -euo pipefail
cd "$(dirname "$0")/test-page"
mkdir -p media
for i in 0 1 2; do
  src="testsrc2=size=720x1280:rate=30:duration=8,hue=h=$((i * 60))"
  [ -f "media/h264-$i.mp4" ] || ffmpeg -loglevel error -y -f lavfi -i "$src" -c:v libx264 -pix_fmt yuv420p \
    -profile:v high -b:v 3M -movflags +faststart "media/h264-$i.mp4"
  [ -f "media/vp9-$i.webm" ] || ffmpeg -loglevel error -y -f lavfi -i "$src" -c:v libvpx-vp9 -b:v 3M \
    -deadline realtime -cpu-used 8 "media/vp9-$i.webm"
  [ -f "media/av1-$i.mp4" ] || ffmpeg -loglevel error -y -f lavfi -i "$src" -c:v libsvtav1 -preset 10 -b:v 3M \
    -movflags +faststart "media/av1-$i.mp4"
done
for i in $(seq 0 9); do
  [ -f "media/img$i.jpg" ] || ffmpeg -loglevel error -y -f lavfi -i "mandelbrot=size=1440x1800:rate=1" -frames:v 1 \
    -vf "hue=h=$((i * 36))" "media/img$i.jpg"
done
ls media | wc -l
