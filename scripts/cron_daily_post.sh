#!/usr/bin/env bash
# cron_daily_post.sh — drives /reddit-story end-to-end (find → produce → upload).
# Triggered daily by ~/Library/LaunchAgents/com.tianzhichen.aaru.daily-post.plist
# at 19:00 local time (7 PM ET when the Mac is set to America/New_York).
#
# Logs to marketing/stories/cron.log. Exits non-zero on failure so launchd
# records it in `launchctl print gui/$(id -u)/com.tianzhichen.aaru.daily-post`.

set -uo pipefail

PROJECT_DIR="/Users/tianzhichen/projects/aaru"
LOG="${PROJECT_DIR}/marketing/stories/cron.log"

# launchd starts with a minimal PATH; add Homebrew + user bins so claude,
# yt-dlp, ffmpeg, and the venv python are all reachable.
export PATH="/Users/tianzhichen/.local/bin:/Users/tianzhichen/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

cd "$PROJECT_DIR" || { echo "[$(date)] cannot cd to $PROJECT_DIR" >> "$LOG"; exit 1; }

mkdir -p "$(dirname "$LOG")"
{
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "  cron_daily_post  $(date -Iseconds)"
  echo "════════════════════════════════════════════════════════════"

  # Source .env so FAL_KEY / ANTHROPIC_API_KEY etc. are available.
  set -a
  # shellcheck disable=SC1091
  source .env 2>/dev/null || echo "warning: .env not sourced cleanly"
  set +a

  # Drive the skill non-interactively. Auto-allow tools (no human present).
  claude \
    -p "/reddit-story" \
    --dangerously-skip-permissions \
    --output-format text &
  claude_pid=$!

  # Watchdog: 30-minute hard cap so a hung run doesn't wedge tomorrow.
  ( sleep 1800; kill -TERM $claude_pid 2>/dev/null; sleep 10; kill -KILL $claude_pid 2>/dev/null ) &
  watchdog_pid=$!

  wait $claude_pid
  rc=$?
  kill $watchdog_pid 2>/dev/null || true

  echo "[$(date -Iseconds)] claude exit=$rc"
  exit $rc
} >> "$LOG" 2>&1
