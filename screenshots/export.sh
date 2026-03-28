#!/bin/bash
# Export App Store screenshots as 1284x2778 PNGs using Chrome headless
# Usage: cd screenshots && ./export.sh

set -e

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ ! -f "$CHROME" ]; then
  echo "Chrome not found. Install Google Chrome or update the path."
  exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"

for i in 1 2 3; do
  case $i in
    1) name="conversation" ;;
    2) name="soul-file" ;;
    3) name="onboarding" ;;
  esac

  INPUT="file://${DIR}/screenshot-${i}-${name}.html"
  OUTPUT="${DIR}/appstore-${i}-${name}.png"

  echo "Rendering screenshot ${i} (${name})..."

  "$CHROME" \
    --headless=new \
    --disable-gpu \
    --screenshot="$OUTPUT" \
    --window-size=1284,2778 \
    --force-device-scale-factor=1 \
    --hide-scrollbars \
    "$INPUT"

  echo "  → ${OUTPUT}"
done

echo ""
echo "Done! 3 screenshots exported at 1284x2778."
echo "Upload these directly to App Store Connect."
