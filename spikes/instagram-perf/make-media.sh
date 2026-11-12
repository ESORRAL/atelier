#!/usr/bin/env bash
# Generates the heavy local media of the scroll test page (not versioned): 30 large JPEGs, 6 looping H.264 reels.
set -euo pipefail
cd "$(dirname "$0")/test-page"
mkdir -p media
python3 - <<'EOF'
import random
from PIL import Image, ImageDraw, ImageFilter
random.seed(1)
for i in range(30):
    im = Image.new("RGB", (1440, 1800))
    d = ImageDraw.Draw(im)
    for _ in range(400):
        x, y = random.randrange(1440), random.randrange(1800)
        r = random.randrange(20, 200)
        d.ellipse((x - r, y - r, x + r, y + r), fill=tuple(random.randrange(256) for _ in range(3)))
    im = im.filter(ImageFilter.GaussianBlur(2))
    im.save(f"media/img{i}.jpg", quality=90)
EOF
for i in 0 1 2 3 4 5; do
  [ -f "media/reel$i.mp4" ] && continue
  ffmpeg -loglevel error -y -f lavfi -i "testsrc2=size=720x1280:rate=30:duration=8,hue=h=$((i * 60))" \
    -c:v libx264 -pix_fmt yuv420p -profile:v high -b:v 3M -movflags +faststart "media/reel$i.mp4"
done
ls media | wc -l
