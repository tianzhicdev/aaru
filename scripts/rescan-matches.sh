#!/bin/bash
# Re-bootstrap existing simulation users and trigger matching scans one by one.
# Waits for each scan's matches to appear before moving to the next user.

set -euo pipefail

API="https://thumos-api-dev.tianzhic-dev.workers.dev"
POLL_INTERVAL=15
MAX_WAIT=600  # 10 minutes per user

USERS=(
  "Yuki:0c5fe0cb-965a-4569-88bb-1a3a35cb2608"
  "Marco:dc5ebaf0-578d-4df5-a9ba-fa3a1e84c1a8"
  "Mei-Lin:e4c9edff-53cd-41a5-bcb2-cfdb1089edb2"
  "Sören:b1712e13-82eb-4fab-8a87-fec96016e8c1"
  "Priya:0d2384d9-9087-4c6b-9f8e-035d3b36ca13"
  "Jin-woo:efa2d919-6508-40f1-bb13-474334ff9b75"
  "Léa:46088f9e-f954-459f-a02d-ea2700447e8b"
  "Rafael:5a6e1498-e965-4d9e-a556-2f38bb29823b"
  "Amira:8556712c-dc40-4a40-9578-53b843a2c3ff"
  "Sophie:1bf0e8f7-5a24-478b-939d-18ccc508ffae"
)

echo ""
echo "═══ Sequential Matching Scan ═══"
echo "  Users: ${#USERS[@]}"
echo "  API: $API"
echo ""

TOTAL_MATCHES=0

for entry in "${USERS[@]}"; do
  NAME="${entry%%:*}"
  DEVICE_ID="${entry##*:}"

  # Re-bootstrap to get a fresh session token
  BOOT=$(curl -s -X POST "$API/bootstrap-soul" \
    -H "Content-Type: application/json" \
    -d "{\"device_id\":\"$DEVICE_ID\"}")
  TOKEN=$(echo "$BOOT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")

  if [ -z "$TOKEN" ]; then
    echo "  [$NAME] bootstrap failed: $BOOT"
    continue
  fi

  USER_ID=$(echo "$BOOT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('user_id',''))" 2>/dev/null || echo "")
  echo "  [$NAME] session acquired (user ${USER_ID:0:8}...)"

  # Trigger matching scan
  SCAN=$(curl -s -X POST "$API/run-matching-scan" \
    -H "Content-Type: application/json" \
    -H "x-thumos-session: $TOKEN")
  STATUS=$(echo "$SCAN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")

  if [ "$STATUS" != "scanning" ]; then
    REASON=$(echo "$SCAN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('reason','unknown'))" 2>/dev/null || echo "unknown")
    echo "  [$NAME] scan not eligible: $REASON"
    continue
  fi

  echo -n "  [$NAME] scanning"

  # Poll for matches
  ELAPSED=0
  PREV_COUNT=0
  STABLE_ROUNDS=0
  while [ $ELAPSED -lt $MAX_WAIT ]; do
    sleep $POLL_INTERVAL
    ELAPSED=$((ELAPSED + POLL_INTERVAL))

    MATCHES=$(curl -s "$API/soulmate-matches" \
      -H "x-thumos-session: $TOKEN")
    COUNT=$(echo "$MATCHES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('matches',[])))" 2>/dev/null || echo "0")

    echo -n "."

    if [ "$COUNT" -gt 0 ]; then
      # Wait a bit more for reasoning to generate, then check stability
      if [ "$COUNT" -eq "$PREV_COUNT" ]; then
        STABLE_ROUNDS=$((STABLE_ROUNDS + 1))
      else
        STABLE_ROUNDS=0
      fi
      PREV_COUNT=$COUNT

      # After 2 stable rounds (30s of no new matches), consider done
      if [ $STABLE_ROUNDS -ge 2 ]; then
        break
      fi
    fi
  done

  if [ "$COUNT" -gt 0 ]; then
    echo " $COUNT match(es) found (${ELAPSED}s)"
    TOTAL_MATCHES=$((TOTAL_MATCHES + COUNT))
    # Print match details
    echo "$MATCHES" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for m in data.get('matches', []):
    name = m.get('display_name', '?')
    score = m.get('score', '?')
    zones = ', '.join(m.get('connection_zones', []))
    reasoning = (m.get('reasoning') or '')[:100]
    print(f'    → {name} (score: {score}, zones: {zones})')
    if reasoning:
        print(f'      {reasoning}...')
" 2>/dev/null
  else
    echo " no matches after ${ELAPSED}s"
  fi

  echo ""
done

echo "═══ Summary ═══"
echo "  Total matches found: $TOTAL_MATCHES"
echo ""
