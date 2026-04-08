#!/usr/bin/env bash
set -euo pipefail

# Simulation script for ja/fr × value_v2/frontier_v1
BASE_URL="https://thumos-api-dev.tianzhic-dev.workers.dev"
OUTPUT_BASE="dry-run-output"

simulate() {
  local lang="$1"
  local profile="$2"
  shift 2
  local msgs=("$@")
  local dir="${OUTPUT_BASE}/${lang}-${profile}"

  mkdir -p "$dir"
  echo "=== Simulating: lang=$lang profile=$profile ==="

  # 1. Bootstrap user
  local device_id="sim-${lang}-${profile}-$(date +%s)"
  echo "Bootstrapping device_id=$device_id ..."
  local bootstrap_resp
  bootstrap_resp=$(curl -s -X POST "$BASE_URL/bootstrap-soul" \
    -H "Content-Type: application/json" \
    -d "{\"device_id\": \"$device_id\"}")

  echo "$bootstrap_resp" | jq . > "$dir/bootstrap.json" 2>/dev/null || echo "$bootstrap_resp" > "$dir/bootstrap.json"

  local token
  token=$(echo "$bootstrap_resp" | jq -r '.token // empty')
  local user_id
  user_id=$(echo "$bootstrap_resp" | jq -r '.user_id // empty')

  if [ -z "$token" ] || [ -z "$user_id" ]; then
    echo "ERROR: Bootstrap failed"
    echo "$bootstrap_resp"
    return 1
  fi
  echo "  user_id=$user_id"

  # 2. Set language
  echo "  Setting language=$lang ..."
  curl -s -X POST "$BASE_URL/update-language" \
    -H "Content-Type: application/json" \
    -H "x-thumos-session: $token" \
    -d "{\"language\": \"$lang\"}" > "$dir/set-language.json"

  # 3. Set model profile
  echo "  Setting model_profile=$profile ..."
  curl -s -X POST "$BASE_URL/set-model-profile" \
    -H "Content-Type: application/json" \
    -H "x-thumos-session: $token" \
    -d "{\"model_profile_id\": \"$profile\"}" > "$dir/set-profile.json"

  # 4. Opening message
  echo "  Opening conversation ..."
  local opening_resp
  opening_resp=$(curl -s -X POST "$BASE_URL/soul-converse" \
    -H "Content-Type: application/json" \
    -H "x-thumos-session: $token" \
    -H "Accept: text/event-stream" \
    -d '{"mode": "opening"}')
  echo "$opening_resp" > "$dir/opening-raw.txt"

  local opening_text
  opening_text=$(echo "$opening_resp" | grep '^data: ' | sed 's/^data: //' | jq -r 'select(.type == "done") | .full_text // empty' 2>/dev/null || true)
  if [ -z "$opening_text" ]; then
    opening_text=$(echo "$opening_resp" | grep '^data: ' | sed 's/^data: //' | jq -r 'select(.type == "text_delta") | .text // empty' 2>/dev/null | tr -d '\n' || true)
  fi
  echo "  AI opening: ${opening_text:0:120}..."
  echo "$opening_text" > "$dir/opening-text.txt"

  # 5. User replies
  for i in $(seq 0 $((${#msgs[@]} - 1))); do
    local msg="${msgs[$i]}"
    echo "  User message $((i+1))/${#msgs[@]} ..."

    local reply_resp
    reply_resp=$(curl -s -X POST "$BASE_URL/soul-converse" \
      -H "Content-Type: application/json" \
      -H "x-thumos-session: $token" \
      -H "Accept: text/event-stream" \
      -d "{\"mode\": \"reply\", \"message\": $(echo "$msg" | jq -Rs .)}")
    echo "$reply_resp" > "$dir/reply-${i}-raw.txt"

    local reply_text
    reply_text=$(echo "$reply_resp" | grep '^data: ' | sed 's/^data: //' | jq -r 'select(.type == "done") | .full_text // empty' 2>/dev/null || true)
    if [ -z "$reply_text" ]; then
      reply_text=$(echo "$reply_resp" | grep '^data: ' | sed 's/^data: //' | jq -r 'select(.type == "text_delta") | .text // empty' 2>/dev/null | tr -d '\n' || true)
    fi
    echo "  AI reply $((i+1)): ${reply_text:0:120}..."
    echo "$reply_text" > "$dir/reply-${i}-text.txt"

    sleep 1
  done

  # 6. Trigger soul file synthesis
  echo "  Triggering soul file synthesis ..."
  curl -s -X GET "$BASE_URL/get-soul-file" \
    -H "x-thumos-session: $token" > "$dir/soul-file-trigger.json"

  # 7. Wait for synthesis
  echo "  Waiting 45s for synthesis ..."
  sleep 45

  # 8. Fetch final soul file
  echo "  Fetching final soul file ..."
  local soul_file
  soul_file=$(curl -s -X GET "$BASE_URL/get-soul-file" \
    -H "x-thumos-session: $token")
  echo "$soul_file" | jq . > "$dir/soul-file-final.json" 2>/dev/null || echo "$soul_file" > "$dir/soul-file-final.json"

  echo "=== Done: $dir ==="
  echo ""
}

# Japanese messages
JA_MSGS=(
  "最近、仕事について深く考えています。今の仕事にやりがいを感じる瞬間もあるけど、本当にこれが自分のやりたいことなのか分からなくなることがあります。子供の頃の夢とは全然違う道を歩んでいて。"
  "父との関係が一番複雑です。厳しい人で、褒められた記憶がほとんどない。でも最近、父なりに愛情を示していたのかもしれないと思うようになりました。母が亡くなってから、父が急に小さく見えて。"
  "誠実さと自由、この二つの価値観がいつもぶつかり合っています。約束を守りたい、でも縛られたくもない。会社でも、家庭でも、この葛藤がずっとあります。本当の自分はどちらなのか。"
  "最近、理由もなく涙が出ることがあります。悲しいわけじゃないのに。何かが溢れてくる感じ。妻には心配をかけたくないから、一人の時だけ。こういう感情をどう扱えばいいのか、正直分かりません。"
  "五年後、小さな本屋を開いていたいです。利益は少なくても、本を通じて人と繋がれる場所を作りたい。でもそれは現実逃避かもしれない。安定を捨てる勇気があるのか、自分でも分かりません。"
)

# French messages
FR_MSGS=(
  "Je traverse une période de remise en question profonde. À trente-cinq ans, je réalise que j'ai passé ma vie à répondre aux attentes des autres — mes parents, mes professeurs, mon patron. Je ne sais même plus ce que je veux vraiment."
  "Mon meilleur ami depuis l'enfance m'a dit quelque chose qui m'a bouleversé la semaine dernière. Il m'a dit que je portais un masque avec tout le monde, même avec lui. Ça m'a fait mal parce que je crois qu'il a raison. La vraie intimité me fait peur."
  "Je suis avocate, et les gens pensent que c'est prestigieux. Mais honnêtement, je me sens vide à la fin de chaque journée. Le seul moment où je me sens vivante, c'est quand je peins le week-end. C'est absurde — j'ai fait huit ans d'études pour ça."
  "Il y a une colère en moi que je n'arrive pas à exprimer. Je souris toujours, je suis la fille gentille, celle qui arrange tout. Mais en dessous, il y a cette rage silencieuse. Contre ma mère qui m'a appris à tout avaler, contre moi-même qui continue."
  "Je veux apprendre à dire non sans me sentir coupable. Je veux pouvoir rester seule un dimanche sans anxiété. Je veux arrêter de mesurer ma valeur au regard des autres. C'est simple à dire, mais chaque jour c'est un combat."
)

# Run all 4 simulations
simulate "ja" "value_v2" "${JA_MSGS[@]}"
simulate "ja" "frontier_v1" "${JA_MSGS[@]}"
simulate "fr" "value_v2" "${FR_MSGS[@]}"
simulate "fr" "frontier_v1" "${FR_MSGS[@]}"

echo "All simulations complete!"
echo "Results in: $OUTPUT_BASE/{ja,fr}-{value_v2,frontier_v1}/"
