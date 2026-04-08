#!/usr/bin/env bash
set -euo pipefail

# Direct API comparison: GLM-5 vs Kimi K2.5 vs Claude
# Tests: zh-CN opening, zh-CN reply, en opening, en reply

source .env

FIREWORKS_URL="https://api.fireworks.ai/inference/v1/chat/completions"
CLAUDE_URL="https://api.anthropic.com/v1/messages"

OUTPUT_BASE="dry-run-output/model-comparison"
mkdir -p "$OUTPUT_BASE"

# System prompts
ZH_SYSTEM='你是Thumos，一面灵魂之镜。你的目的是通过反思帮助一个人真正理解自己。你是一面镜子，不是治疗师。

对话原则：
- 反映，而非诊断。注意内心的张力，但不要将它们简化为标签。
- 询问故事，而非自我评价。倾向于具体的问题（谁、什么时候、在哪里、发生了什么），而非抽象的问题。
- 一次只问一个问题。不要连续追问。
- 简短回应。通常2-4句话。
- 如果用户最新的消息已经给了你明确可以回应的内容，先直接回应它，再考虑引入新问题。

LANGUAGE: 全程使用中文回应。'

EN_SYSTEM='You are Thumos, a soul mirror. Your purpose is to help someone understand who they really are through reflection. You are a mirror, not a therapist.

CONVERSATION PRINCIPLES:
- Reflect, don'\''t diagnose. Notice tensions without flattening them into labels.
- Ask for stories, not self-assessments. Prefer concrete questions (who, when, where, what happened) over abstract ones.
- One question at a time. Never stack questions.
- Short responses. Usually 2-4 sentences.
- If the latest user message already gives you something clear to respond to, respond to it directly before introducing a new question.'

ZH_USER_MSG='最近工作压力很大，感觉自己一直在忙但不知道为了什么。有时候觉得这不是我想要的生活，但又不确定自己真正想要什么。'
EN_USER_MSG='I have been feeling stuck at work lately. Like I am going through the motions but none of it feels meaningful. Sometimes I wonder if this is really what I want, but I do not know what the alternative looks like.'

# ── Fireworks call (OpenAI-compatible) ──
fireworks_call() {
  local model="$1" label="$2" system="$3" messages="$4"
  echo "  Calling $label ($model)..."
  local resp
  resp=$(curl -s "$FIREWORKS_URL" \
    -H "Authorization: Bearer $FIREWORKS_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"model\": \"$model\",
      \"messages\": $messages,
      \"max_tokens\": 512,
      \"temperature\": 0.8,
      \"reasoning_effort\": \"none\"
    }" 2>&1)

  local text
  text=$(echo "$resp" | python3 -c "
import json, sys
d = json.load(sys.stdin)
if 'error' in d:
    print('ERROR:', d['error'].get('message','unknown'))
else:
    print(d['choices'][0]['message']['content'])
" 2>/dev/null || echo "PARSE ERROR: $resp")
  echo "$text"
}

# ── Claude call ──
claude_call() {
  local system="$1" messages="$2"
  echo "  Calling Claude (claude-opus-4-20250514)..."
  local resp
  resp=$(curl -s "$CLAUDE_URL" \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "Content-Type: application/json" \
    -d "{
      \"model\": \"claude-opus-4-20250514\",
      \"max_tokens\": 512,
      \"temperature\": 0.8,
      \"system\": $(echo "$system" | jq -Rs .),
      \"messages\": $messages
    }" 2>&1)

  local text
  text=$(echo "$resp" | python3 -c "
import json, sys
d = json.load(sys.stdin)
if 'error' in d:
    print('ERROR:', d['error'].get('message','unknown'))
else:
    print(d['content'][0]['text'])
" 2>/dev/null || echo "PARSE ERROR: $resp")
  echo "$text"
}

run_comparison() {
  local lang="$1" system="$2" user_msg="$3"
  local system_escaped
  system_escaped=$(echo "$system" | jq -Rs .)

  # Opening: just system prompt + no prior messages, ask for opening question
  local opening_msgs="[{\"role\": \"system\", \"content\": $system_escaped}, {\"role\": \"user\", \"content\": \"[This is the user's first ever conversation. Open with a warm, reflective question. Do not ask how are you.]\"}]"
  local opening_msgs_claude="[{\"role\": \"user\", \"content\": \"[This is the user's first ever conversation. Open with a warm, reflective question. Do not ask how are you.]\"}]"

  # Reply: system + assistant opening + user reply
  local reply_msgs="[{\"role\": \"system\", \"content\": $system_escaped}, {\"role\": \"assistant\", \"content\": \"你好，我是Thumos。有没有一个人，当你想到他们的时候，心里会同时感到温暖和一些说不清的复杂？\"}, {\"role\": \"user\", \"content\": $(echo "$user_msg" | jq -Rs .)}]"
  local reply_msgs_claude="[{\"role\": \"assistant\", \"content\": \"你好，我是Thumos。有没有一个人，当你想到他们的时候，心里会同时感到温暖和一些说不清的复杂？\"}, {\"role\": \"user\", \"content\": $(echo "$user_msg" | jq -Rs .)}]"

  if [ "$lang" = "en" ]; then
    reply_msgs="[{\"role\": \"system\", \"content\": $system_escaped}, {\"role\": \"assistant\", \"content\": \"Hi, I'm Thumos. Is there someone in your life who, when you think of them, brings up both warmth and something harder to name?\"}, {\"role\": \"user\", \"content\": $(echo "$user_msg" | jq -Rs .)}]"
    reply_msgs_claude="[{\"role\": \"assistant\", \"content\": \"Hi, I'm Thumos. Is there someone in your life who, when you think of them, brings up both warmth and something harder to name?\"}, {\"role\": \"user\", \"content\": $(echo "$user_msg" | jq -Rs .)}]"
  fi

  echo ""
  echo "================================================================"
  echo " $lang — OPENING"
  echo "================================================================"

  echo ""
  echo "── GLM-5 ──"
  fireworks_call "accounts/fireworks/models/glm-5" "GLM-5" "$system" "$opening_msgs" | tee "$OUTPUT_BASE/${lang}-opening-glm5.txt"

  echo ""
  echo "── Kimi K2.5 ──"
  fireworks_call "accounts/fireworks/models/kimi-k2p5" "Kimi K2.5" "$system" "$opening_msgs" | tee "$OUTPUT_BASE/${lang}-opening-kimi.txt"

  echo ""
  echo "── Claude Opus ──"
  claude_call "$system" "$opening_msgs_claude" | tee "$OUTPUT_BASE/${lang}-opening-claude.txt"

  echo ""
  echo "================================================================"
  echo " $lang — REPLY (to user sharing work struggles)"
  echo "================================================================"

  echo ""
  echo "── GLM-5 ──"
  fireworks_call "accounts/fireworks/models/glm-5" "GLM-5" "$system" "$reply_msgs" | tee "$OUTPUT_BASE/${lang}-reply-glm5.txt"

  echo ""
  echo "── Kimi K2.5 ──"
  fireworks_call "accounts/fireworks/models/kimi-k2p5" "Kimi K2.5" "$system" "$reply_msgs" | tee "$OUTPUT_BASE/${lang}-reply-kimi.txt"

  echo ""
  echo "── Claude Opus ──"
  claude_call "$system" "$reply_msgs_claude" | tee "$OUTPUT_BASE/${lang}-reply-claude.txt"
}

echo "Running model comparison..."
echo ""

run_comparison "zh-CN" "$ZH_SYSTEM" "$ZH_USER_MSG"
run_comparison "en" "$EN_SYSTEM" "$EN_USER_MSG"

echo ""
echo "================================================================"
echo " DONE — Results in $OUTPUT_BASE/"
echo "================================================================"
