#!/usr/bin/env bash
set -euo pipefail

# Romance Pivot V4: Short i18n simulations — all 8 languages, 10 messages each
BASE_URL="https://thumos-api-dev.tianzhic-dev.workers.dev"
OUTPUT_BASE="dry-run-output/romance-pivot"
DEBUG_TOKEN="${DEBUG_API_TOKEN_DEV:-${DEBUG_API_TOKEN:-}}"

simulate() {
  local lang="$1"
  local profile="$2"
  shift 2
  local msgs=("$@")
  local dir="${OUTPUT_BASE}/${lang}-${profile}"

  mkdir -p "$dir"
  echo "=== Simulating: lang=$lang profile=$profile ==="

  # 1. Bootstrap user
  local device_id="romance-${lang}-${profile}-$(date +%s)"
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
    -H "x-thumos-debug-token: $DEBUG_TOKEN" \
    -d "{\"model_profile_id\": \"$profile\"}" > "$dir/set-profile.json"

  # 4. Opening message
  echo "  Opening conversation ..."
  local opening_resp
  opening_resp=$(curl -s -X POST "$BASE_URL/soul-converse" \
    -H "Content-Type: application/json" \
    -H "x-thumos-session: $token" \
    -H "Accept: application/json" \
    -d '{"mode": "opening"}')
  echo "$opening_resp" | jq . > "$dir/opening.json" 2>/dev/null || echo "$opening_resp" > "$dir/opening.json"

  local opening_text
  opening_text=$(echo "$opening_resp" | jq -r '.content // empty' 2>/dev/null || true)
  echo "  AI opening: ${opening_text:0:200}"
  echo "$opening_text" > "$dir/opening-text.txt"

  # 5. Conversation: alternating user replies and AI responses
  local conversation="## Opening\n**AI:** $opening_text\n"
  for i in $(seq 0 $((${#msgs[@]} - 1))); do
    local msg="${msgs[$i]}"
    echo "  Exchange $((i+1))/${#msgs[@]} ..."
    conversation+="\n**User:** $msg\n"

    local reply_resp
    reply_resp=$(curl -s -X POST "$BASE_URL/soul-converse" \
      -H "Content-Type: application/json" \
      -H "x-thumos-session: $token" \
      -H "Accept: application/json" \
      -d "{\"mode\": \"reply\", \"message\": $(echo "$msg" | jq -Rs .)}")

    local reply_text
    reply_text=$(echo "$reply_resp" | jq -r '.content // empty' 2>/dev/null || true)
    if [ -z "$reply_text" ]; then
      # Try SSE format
      reply_text=$(echo "$reply_resp" | grep '^data: ' | sed 's/^data: //' | jq -r 'select(.type == "done") | .full_text // empty' 2>/dev/null || true)
    fi
    echo "  AI: ${reply_text:0:150}..."
    conversation+="\n**AI:** $reply_text\n"

    sleep 1
  done

  # 6. Write conversation markdown
  echo -e "$conversation" > "$dir/conversation.md"

  # 7. Trigger soul file synthesis
  echo "  Triggering synthesis ..."
  curl -s -X GET "$BASE_URL/get-soul-file" \
    -H "x-thumos-session: $token" > "$dir/soul-file-trigger.json"

  # 8. Wait for synthesis
  echo "  Waiting 60s for synthesis ..."
  sleep 60

  # 9. Fetch final soul file
  local soul_file
  soul_file=$(curl -s -X GET "$BASE_URL/get-soul-file" \
    -H "x-thumos-session: $token")
  echo "$soul_file" | jq . > "$dir/visible-soul-file.json" 2>/dev/null || echo "$soul_file" > "$dir/visible-soul-file.json"

  # 10. Fetch debug dump if token available
  if [ -n "$DEBUG_TOKEN" ]; then
    echo "  Fetching debug dump ..."
    local debug_dump
    debug_dump=$(curl -s -X POST "$BASE_URL/debug-dump" \
      -H "Content-Type: application/json" \
      -H "x-thumos-session: $token" \
      -H "x-thumos-debug-token: $DEBUG_TOKEN" \
      -d '{}')
    echo "$debug_dump" | jq . > "$dir/debug-dump.json" 2>/dev/null || echo "$debug_dump" > "$dir/debug-dump.json"
  fi

  echo "=== Done: $dir ==="
  echo ""
}

# === Romance-oriented messages per language ===
# 5 messages each — light, Spark-phase appropriate, about daily life and what brings joy

EN_MSGS=(
  "I've been thinking about what makes an ordinary day feel good. Like, there's something about making coffee in the morning while the house is still quiet. That little ritual before anyone else is up."
  "I think I'm most myself when I'm cooking for people I care about. There's something about feeding someone — like you're saying 'I see you, sit down, I've got this.' My mom was like that too."
  "Honestly, I laugh hardest at dumb jokes. The more terrible the pun, the better. My friends make fun of me for it but I think being able to be silly with someone is underrated."
  "I went for a long walk yesterday and realized I never just... do nothing anymore. Even my hobbies have become productive. When did everything become about output? I miss just goofing around."
  "The relationships that have meant the most to me are the ones where we could just be quiet together. No pressure to perform or entertain. Just two people existing in the same space, comfortable."
)

ZH_MSGS=(
  "最近在想什么样的日子让我觉得幸福。其实就是很简单的事，比如周末早上慢慢做早餐，阳光照进厨房，不用赶时间。"
  "我觉得最真实的自己是和朋友在一起吃火锅的时候。大家一起涮肉、聊天、笑得停不下来。那种热闹让我觉得被爱着。"
  "我其实是个很容易被感动的人，看电影会哭那种。以前觉得不好意思，现在觉得能被触动也是一种能力吧。"
  "有时候我觉得现代人太忙了，连发呆的时间都没有。我特别怀念小时候，可以在院子里看蚂蚁看一下午，什么都不想。"
  "对我来说最好的关系就是两个人可以各做各的事但待在一起，偶尔抬头看一眼对方，笑一下，又继续。不需要一直说话。"
)

JA_MSGS=(
  "最近、何が自分を幸せにするのか考えています。意外とシンプルなことなんですよね。朝の散歩とか、お気に入りのカフェでぼーっとする時間とか。"
  "料理が好きなんです。誰かのために作る時が特に。おいしいって言ってもらえると、なんだか全部報われる感じがします。愛情表現の一つなのかもしれません。"
  "笑いのツボが浅いんです。くだらないダジャレとかで大笑いしちゃう。一緒にバカなことで笑える人がいるのは、本当に大切なことだと思います。"
  "最近は何でも効率を求めちゃって。ぼんやりする時間が罪悪感に変わっちゃうんですよね。子供の頃は何時間でも空を眺めてられたのに。"
  "一番心地いい関係は、沈黙が怖くない関係だと思います。一緒にいて、無言でも安心できる。それって信頼の証だと思うんです。"
)

FR_MSGS=(
  "Je réfléchis beaucoup à ce qui rend une journée ordinaire belle. Pour moi, c'est préparer le petit-déjeuner un dimanche matin, avec la radio en fond et personne qui se presse."
  "Je suis quelqu'un qui aime prendre soin des autres à travers la nourriture. Quand je cuisine pour mes amis, c'est ma façon de dire que je tiens à eux. Ma grand-mère était comme ça aussi."
  "J'ai un humour assez bête en fait. Les jeux de mots terribles me font hurler de rire. Je crois que pouvoir être ridicule avec quelqu'un, c'est un signe de vraie intimité."
  "Je me suis rendu compte que je ne fais plus jamais rien sans but. Même mes loisirs sont devenus productifs. J'aimerais retrouver le plaisir de flâner, de ne rien faire, juste être."
  "Les relations qui comptent le plus pour moi sont celles où on peut être silencieux ensemble. Pas de pression, pas de performance. Juste deux personnes qui partagent un espace en paix."
)

ES_MSGS=(
  "Últimamente pienso en qué hace que un día normal sea especial. Para mí es algo tan simple como tomar café por la mañana mientras escucho los pájaros. Esa calma antes de que empiece todo."
  "Creo que soy más yo cuando cocino para las personas que quiero. Es mi forma de decir te quiero sin palabras. Mi abuela era igual — siempre tenía algo en el horno para quien llegara."
  "Me río de las cosas más tontas. Chistes malos, situaciones absurdas. Mis amigos dicen que tengo la risa fácil, pero yo creo que poder reírse así con alguien es un regalo."
  "El otro día me di cuenta de que hace mucho no hago nada sin propósito. Todo tiene que ser productivo. Extraño cuando podía pasar una tarde entera sin hacer nada y sentirme bien."
  "Para mí, la mejor relación es cuando puedes estar callado con alguien sin que sea incómodo. Ese silencio cómodo donde no tienes que llenar el espacio. Eso es confianza."
)

KO_MSGS=(
  "요즘 뭐가 나를 행복하게 하는지 생각해봤어요. 의외로 소소한 거더라고요. 주말 아침에 천천히 커피 내리면서 창밖 보는 시간이 제일 좋아요."
  "저는 사람들한테 밥 해주는 걸 좋아해요. 맛있게 먹는 모습을 보면 뭔가 뿌듯하고. 그게 제 사랑 표현 방식인 것 같아요. 엄마도 그랬거든요."
  "저 웃음이 진짜 많아요. 아재개그에도 빵 터지는 스타일. 같이 바보 같은 걸로 웃을 수 있는 사이가 진짜 좋은 관계라고 생각해요."
  "요즘 아무것도 안 하는 시간이 없어요. 쉬는 것도 뭔가 생산적이어야 할 것 같은 압박감. 어릴 때는 하루 종일 멍 때려도 행복했는데."
  "제일 편한 관계는 말 안 해도 편한 관계인 것 같아요. 같이 있는데 침묵이 어색하지 않은. 그런 게 진짜 신뢰라고 생각해요."
)

PT_MSGS=(
  "Tenho pensado no que faz um dia comum ser bom. Pra mim é algo simples tipo fazer café de manhã ouvindo música, sem pressa nenhuma. Esse momento antes do dia começar."
  "Eu acho que sou mais eu quando estou cozinhando pra alguém. É minha forma de cuidar, sabe? Quando a pessoa come e faz aquela cara de feliz, vale tudo. Aprendi isso com minha avó."
  "Eu rio das coisas mais bobas. Piada ruim me acaba. Acho que poder ser bobo com alguém é tipo o nível mais alto de intimidade que existe."
  "Outro dia percebi que faz tempo que não faço nada sem propósito. Até meu descanso virou produtivo. Sinto falta de simplesmente existir sem precisar justificar."
  "O melhor tipo de relacionamento pra mim é quando você pode ficar em silêncio com a pessoa e tá tudo bem. Não precisa preencher o espaço. Só estar junto já é suficiente."
)

DE_MSGS=(
  "Ich denke in letzter Zeit darüber nach, was einen normalen Tag schön macht. Für mich ist es so etwas Einfaches wie morgens in Ruhe Kaffee zu kochen, bevor der Tag losgeht."
  "Ich glaube, ich bin am meisten ich selbst, wenn ich für andere koche. Das ist meine Art zu zeigen, dass mir jemand wichtig ist. Meine Oma war genauso — es gab immer etwas Warmes."
  "Ich lache über die dümmsten Sachen. Schlechte Wortspiele bringen mich zum Kreischen. Ich finde, mit jemandem albern sein zu können ist ein Zeichen von echtem Vertrauen."
  "Mir ist aufgefallen, dass ich nie einfach nichts tue. Alles muss produktiv sein. Ich vermisse die Zeit als Kind, wo man stundenlang ins Leere schauen konnte und das okay war."
  "Die besten Beziehungen sind für mich die, in denen Stille nicht unangenehm ist. Einfach zusammen sein, ohne reden zu müssen. Das ist für mich echtes Vertrauen."
)

# Run all 8 languages with value_v1
simulate "en" "value_v1" "${EN_MSGS[@]}"
simulate "zh-CN" "value_v1" "${ZH_MSGS[@]}"
simulate "ja" "value_v1" "${JA_MSGS[@]}"
simulate "fr" "value_v1" "${FR_MSGS[@]}"
simulate "es" "value_v1" "${ES_MSGS[@]}"
simulate "ko" "value_v1" "${KO_MSGS[@]}"
simulate "pt-BR" "value_v1" "${PT_MSGS[@]}"
simulate "de" "value_v1" "${DE_MSGS[@]}"

echo "All 8 language simulations complete!"
echo "Results in: $OUTPUT_BASE/{en,zh-CN,ja,fr,es,ko,pt-BR,de}-value_v1/"
