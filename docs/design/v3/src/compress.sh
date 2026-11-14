#!/bin/bash
# Compress every PNG under png/, png-dark/ and before-after/ in place: pngquant (lossy palette) then oxipng (lossless).
set -e; cd "$(dirname "$0")/.."
find png png-dark before-after -name '*.png' -print0 | xargs -0 -P8 -n8 pngquant --quality=70-95 --speed 3 --skip-if-larger --force --ext .png || true
python3 - <<'P'
import oxipng,glob
from concurrent.futures import ThreadPoolExecutor
fs=glob.glob('png/**/*.png',recursive=True)+glob.glob('png-dark/**/*.png',recursive=True)+glob.glob('before-after/*.png')
with ThreadPoolExecutor(8) as ex: list(ex.map(lambda f:oxipng.optimize(f,level=2),fs))
print('oxipng',len(fs))
P
