#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build"
RES="$ROOT/resources"
PUB="$ROOT/public"
SVG="$BUILD/icon.svg"

mkdir -p "$BUILD" "$RES" "$PUB"

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "rsvg-convert required (brew install librsvg)" >&2
  exit 1
fi

rsvg-convert -w 1024 -h 1024 "$SVG" -o "$BUILD/icon.png"
cp "$BUILD/icon.png" "$PUB/favicon.png"

ICONSET="$BUILD/icon.iconset"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"

sizes=(16 32 128 256 512)
for size in "${sizes[@]}"; do
  rsvg-convert -w "$size" -h "$size" "$SVG" -o "$ICONSET/icon_${size}x${size}.png"
  dbl=$((size * 2))
  rsvg-convert -w "$dbl" -h "$dbl" "$SVG" -o "$ICONSET/icon_${size}x${size}@2x.png"
done

iconutil -c icns "$ICONSET" -o "$BUILD/icon.icns"
rm -rf "$ICONSET"

rsvg-convert -w 36 -h 36 "$SVG" -o "$RES/trayIcon.png"
rsvg-convert -w 256 -h 256 "$SVG" -o "$RES/icon.png"

echo "Icons generated in build/, resources/, public/"
