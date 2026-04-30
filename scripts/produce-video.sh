#!/usr/bin/env bash
set -euo pipefail

# Load FAL_KEY from .env if not already set
if [ -z "${FAL_KEY:-}" ] && [ -f .env ]; then
    FAL_KEY=$(grep -E '^FAL_KEY=' .env | cut -d= -f2-)
    export FAL_KEY
fi

if [ -z "${FAL_KEY:-}" ]; then
    echo "Error: FAL_KEY not set. Add FAL_KEY=<key> to .env or export it."
    exit 1
fi

if [ $# -lt 1 ]; then
    echo "Usage: ./scripts/produce-video.sh <script.json> [--voice NAME]"
    echo ""
    echo "Example:"
    echo "  ./scripts/produce-video.sh marketing/stories/script-01-am-i-just-boring.json"
    echo "  ./scripts/produce-video.sh marketing/stories/script-01-am-i-just-boring.json --voice Daniel"
    exit 1
fi

# Ensure deps are available
python3 -c "import fal_client, requests" 2>/dev/null || {
    echo "Installing dependencies: fal-client requests"
    pip3 install fal-client requests
}

command -v ffprobe >/dev/null || { echo "Error: ffmpeg/ffprobe not found. brew install ffmpeg"; exit 1; }

exec python3 scripts/produce_video.py "$@"
