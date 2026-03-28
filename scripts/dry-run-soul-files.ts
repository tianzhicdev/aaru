#!/usr/bin/env npx tsx
/**
 * dry-run-soul-files.ts
 *
 * CLI client that talks to the deployed Thumos server, simulating characters
 * via Claude to generate soul files for quality review.
 *
 * Usage: npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json
 *        npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json --only fred-rogers
 *        npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json --exchanges 10
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"
import "dotenv/config"

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_BASE = "https://uuggqsywcpqmbqzwxdga.supabase.co"
const FUNCTIONS_BASE = `${SUPABASE_BASE}/functions/v1`
const REST_BASE = `${SUPABASE_BASE}/rest/v1`
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Z2dxc3l3Y3BxbWJxend4ZGdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODk3NjIsImV4cCI6MjA4ODY2NTc2Mn0.zRFOTxQiwF7NJXhKTsnU0G1Zv9E8l_zByb8EZ04OWJ0"

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set in environment or .env")
  process.exit(1)
}

const DEFAULT_EXCHANGES = 12
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const SOFT_SESSION_BACKDATE_MS = 2 * 60 * 60 * 1000 // 2 hours

// ── Types ─────────────────────────────────────────────────────────────────────

interface Character {
  name: string
  displayName: string
  description: string
  voiceNotes: string
}

interface ConversationTurn {
  role: "user" | "assistant"
  content: string
  exchange: number
}

// ── CLI Args ──────────────────────────────────────────────────────────────────

function parseArgs(): { file: string; only?: string; exchanges: number; softSession: boolean } {
  const args = process.argv.slice(2)
  let file = ""
  let only: string | undefined
  let exchanges = DEFAULT_EXCHANGES
  let softSession = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) file = args[++i]
    else if (args[i] === "--only" && args[i + 1]) only = args[++i]
    else if (args[i] === "--exchanges" && args[i + 1]) exchanges = parseInt(args[++i], 10)
    else if (args[i] === "--soft-session") softSession = true
  }

  if (!file) {
    console.error("Usage: npx tsx scripts/dry-run-soul-files.ts --file <characters.json> [--only <name>] [--exchanges <n>] [--soft-session]")
    process.exit(1)
  }

  return { file, only, exchanges, softSession }
}

// ── HTTP Helpers ──────────────────────────────────────────────────────────────

function serverHeaders(sessionToken?: string): Record<string, string> {
  const h: Record<string, string> = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
    "Content-Type": "application/json",
  }
  if (sessionToken) {
    h["x-thumos-session"] = sessionToken
  }
  return h
}

async function serverPost(endpoint: string, body: unknown, sessionToken?: string): Promise<Response> {
  const res = await fetch(`${FUNCTIONS_BASE}/${endpoint}`, {
    method: "POST",
    headers: serverHeaders(sessionToken),
    body: JSON.stringify(body),
  })
  return res
}

async function serverGet(endpoint: string, sessionToken?: string): Promise<Response> {
  const h = serverHeaders(sessionToken)
  delete h["Content-Type"]
  return fetch(`${FUNCTIONS_BASE}/${endpoint}`, {
    method: "GET",
    headers: h,
  })
}

async function restGet(table: string, query: string): Promise<unknown> {
  const res = await fetch(`${REST_BASE}/${table}?${query}`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
  })
  if (!res.ok) return null
  const data = await res.json()
  return Array.isArray(data) && data.length > 0 ? data[0] : null
}

// ── SSE Parser ────────────────────────────────────────────────────────────────

async function readSSEResponse(res: Response): Promise<string> {
  const body = res.body
  if (!body) throw new Error("No response body from soul-converse")

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let fullText = ""
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6))
          if (data.text) {
            fullText += data.text
            process.stdout.write(data.text)
          }
        } catch {
          // skip unparseable lines
        }
      }
    }
  }

  return fullText
}

// ── Character Simulator (Claude call) ─────────────────────────────────────────

async function simulateCharacterResponse(
  character: Character,
  conversation: ConversationTurn[],
  exchangeNumber: number,
): Promise<string> {
  const systemPrompt = `You are roleplaying as ${character.displayName} in a private, honest conversation with a reflective AI mirror called Thumos.

CHARACTER BACKGROUND:
${character.description}

VOICE & STYLE:
${character.voiceNotes}

CONVERSATION RULES:
- Respond as this person would in an intimate, honest conversation about themselves
- Be authentic to their speech patterns, vocabulary, and emotional range
- Start surface-level in early exchanges, go deeper gradually
- By exchange 4-6, begin revealing more personal/vulnerable things
- By exchange 8-10, share something that reveals a core tension or wound
- Don't dump everything at once — let the AI's questions guide you
- Keep responses 2-5 sentences (natural conversation length, not monologues)
- You're talking to an AI, so you can be more honest than you might be with a person
- Never break character or mention you're roleplaying
- Use first person ("I", "me", "my")
- CRITICAL: Do NOT include stage directions, actions, or roleplay markers like *leans back*, *pauses*, *looks away*. Real humans typing on a phone don't narrate their body language. Just write what they would actually type.

CURRENT EXCHANGE: ${exchangeNumber} of ~${DEFAULT_EXCHANGES}
${exchangeNumber <= 2 ? "EARLY: Keep it relatively light, testing the waters." : ""}
${exchangeNumber >= 4 && exchangeNumber <= 6 ? "MIDDLE: Getting more comfortable, starting to share real things." : ""}
${exchangeNumber >= 7 && exchangeNumber <= 9 ? "DEEP: Opening up about core experiences, fears, contradictions." : ""}
${exchangeNumber >= 10 ? "LATE: Most honest and reflective. Saying things you rarely say." : ""}`

  // Build messages from the character's perspective (flip roles)
  const simMessages = conversation.map((t) => ({
    role: (t.role === "assistant" ? "user" : "assistant") as "user" | "assistant",
    content: t.content,
  }))

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      temperature: 0.9,
      system: systemPrompt,
      messages: simMessages,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Character simulation failed: ${res.status} ${err}`)
  }

  const data = await res.json() as { content: Array<{ text: string }> }
  return data.content[0].text
}

// ── Soft Session Helpers ──────────────────────────────────────────────────────

async function backdateRecentMessages(userId: string, offsetMs: number): Promise<void> {
  if (!SERVICE_ROLE_KEY) {
    console.log(`  [soft-session] WARNING: SUPABASE_SERVICE_ROLE_KEY not set, skipping backdate`)
    return
  }

  // Fetch recent messages for this user
  const res = await fetch(
    `${REST_BASE}/soul_messages?user_id=eq.${userId}&order=created_at.desc&limit=6`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    },
  )
  if (!res.ok) {
    console.log(`  [soft-session] failed to fetch messages for backdating: ${res.status}`)
    return
  }

  const messages = await res.json() as Array<{ id: string; created_at: string }>
  if (messages.length === 0) return

  // Backdate all fetched messages
  for (const msg of messages) {
    const original = new Date(msg.created_at)
    const backdated = new Date(original.getTime() - offsetMs).toISOString()
    await fetch(`${REST_BASE}/soul_messages?id=eq.${msg.id}`, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ created_at: backdated }),
    })
  }

  console.log(`  [soft-session] backdated ${messages.length} messages by ${offsetMs / (60 * 60 * 1000)}h`)
}

// ── Main Conversation Loop ────────────────────────────────────────────────────

async function runCharacter(character: Character, exchanges: number, softSession = false): Promise<{
  conversation: ConversationTurn[]
  visibleSoulFile: unknown
  hiddenSoulFile: unknown
  synthesisSucceeded: boolean
}> {
  console.log(`\n${"═".repeat(60)}`)
  console.log(`  ${character.displayName}`)
  console.log(`${"═".repeat(60)}\n`)

  // 1. Bootstrap — create fresh user
  const deviceId = crypto.randomUUID()
  console.log(`[bootstrap] device_id=${deviceId.slice(0, 8)}...`)

  const bootstrapRes = await serverPost("bootstrap-soul", { device_id: deviceId })
  if (!bootstrapRes.ok) {
    const err = await bootstrapRes.text()
    throw new Error(`Bootstrap failed: ${bootstrapRes.status} ${err}`)
  }
  const bootstrap = await bootstrapRes.json() as { user_id: string; token: string }
  const { token } = bootstrap
  console.log(`[bootstrap] user created, token received`)

  // 2. Start session with [begin]
  console.log(`[session] starting with [begin]...`)
  const beginRes = await serverPost(
    "soul-converse",
    { message: "[begin]" },
    token,
  )
  if (!beginRes.ok) {
    const err = await beginRes.text()
    throw new Error(`Begin failed: ${beginRes.status} ${err}`)
  }

  process.stdout.write(`  Thumos:`)
  let openingText = await readSSEResponse(beginRes)
  console.log()

  // Fallback if Thumos returns empty
  if (!openingText.trim()) {
    openingText = "I'm here to listen — not to fix anything or give advice. Just to understand. What's something about yourself that most people don't see?"
    console.log(`  [fallback] used default opening`)
  }

  const conversation: ConversationTurn[] = [
    { role: "assistant", content: openingText, exchange: 0 },
  ]

  // 3. Exchange loop
  const softSessionExchange = Math.ceil(exchanges / 2) // midpoint
  for (let i = 1; i <= exchanges; i++) {
    // Soft session: backdate messages at midpoint to simulate a 2-hour gap
    if (softSession && i === softSessionExchange) {
      console.log(`\n  [soft-session] simulating 2-hour gap at exchange ${i}...`)
      await backdateRecentMessages(bootstrap.user_id, SOFT_SESSION_BACKDATE_MS)
    }

    // Simulate character response
    console.log(`\n  [exchange ${i}/${exchanges}]`)
    process.stdout.write(`  ${character.displayName}: `)
    const charResponse = await simulateCharacterResponse(character, conversation, i)
    console.log(charResponse)

    conversation.push({ role: "user", content: charResponse, exchange: i })

    // Send to server
    process.stdout.write(`  Thumos:`)
    const converseRes = await serverPost(
      "soul-converse",
      { message: charResponse },
      token,
    )

    if (!converseRes.ok) {
      const err = await converseRes.text()
      console.error(`\n  [error] soul-converse failed: ${converseRes.status} ${err}`)
      // Retry once
      console.log(`  [retry] retrying soul-converse...`)
      await new Promise((r) => setTimeout(r, 2000))
      const retryRes = await serverPost("soul-converse", { message: charResponse }, token)
      if (!retryRes.ok) {
        console.error(`  [error] retry also failed, skipping remaining exchanges`)
        break
      }
      process.stdout.write(`  Thumos:`)
      const retryText = await readSSEResponse(retryRes)
      console.log()
      conversation.push({ role: "assistant", content: retryText || "(no response)", exchange: i })
      continue
    }

    let thumosResponse = await readSSEResponse(converseRes)
    if (!thumosResponse.trim()) {
      thumosResponse = "(reflection)"
      console.log(`  [fallback] Thumos returned empty response`)
    }
    console.log()

    conversation.push({ role: "assistant", content: thumosResponse, exchange: i })

    // Small delay to be respectful to the server
    await new Promise((r) => setTimeout(r, 500))
  }

  // 4. End session — triggers synthesis
  console.log(`\n  [synthesis] ending session, triggering 4-expert synthesis...`)
  const endRes = await serverPost("end-soul-session", {}, token)

  let visibleSoulFile: unknown = null
  let hiddenSoulFile: unknown = null
  let synthesisSucceeded = false

  if (!endRes.ok) {
    const err = await endRes.text()
    console.error(`  [error] end-soul-session failed: ${endRes.status} ${err}`)
  } else {
    const endData = await endRes.json() as {
      visible_soul_file: unknown
      synthesis_succeeded: boolean
    }
    visibleSoulFile = endData.visible_soul_file
    synthesisSucceeded = endData.synthesis_succeeded
    console.log(`  [synthesis] ${synthesisSucceeded ? "succeeded" : "FAILED"}`)
  }

  // 5. Fetch hidden soul file via REST API (not exposed by edge functions)
  const userId = bootstrap.user_id
  console.log(`  [fetch] fetching hidden soul file for user ${userId.slice(0, 8)}...`)
  hiddenSoulFile = await restGet("hidden_soul_files", `user_id=eq.${userId}`)
  console.log(`  [fetch] hidden soul file: ${hiddenSoulFile ? "found" : "not found"}`)

  return { conversation, visibleSoulFile, hiddenSoulFile, synthesisSucceeded }
}

// ── Output ────────────────────────────────────────────────────────────────────

function saveResults(
  character: Character,
  conversation: ConversationTurn[],
  visibleSoulFile: unknown,
  hiddenSoulFile: unknown,
  outputDir: string,
) {
  const charDir = join(outputDir, character.name)
  mkdirSync(charDir, { recursive: true })

  // Conversation transcript (human-readable markdown)
  let md = `# Soul Conversation: ${character.displayName}\n\n`
  md += `> ${character.description}\n\n---\n\n`
  for (const turn of conversation) {
    const speaker = turn.role === "assistant" ? "**Thumos**" : `**${character.displayName}**`
    md += `### Exchange ${turn.exchange} — ${speaker}\n\n${turn.content}\n\n`
  }
  writeFileSync(join(charDir, "conversation.md"), md)

  // Soul files as formatted JSON
  if (visibleSoulFile) {
    writeFileSync(
      join(charDir, "visible-soul-file.json"),
      JSON.stringify(visibleSoulFile, null, 2),
    )
  }
  if (hiddenSoulFile) {
    writeFileSync(
      join(charDir, "hidden-soul-file.json"),
      JSON.stringify(hiddenSoulFile, null, 2),
    )
  }

  // Also create a human-readable soul file summary
  let summary = `# Soul File: ${character.displayName}\n\n`
  if (visibleSoulFile && typeof visibleSoulFile === "object") {
    const v = visibleSoulFile as Record<string, unknown>
    if (v.portrait) {
      summary += `## Portrait\n\n${v.portrait}\n\n`
    }
    if (v.sections && typeof v.sections === "object") {
      const sections = v.sections as Record<string, string | null>
      const sectionNames: Record<string, string> = {
        howYouMove: "How You Move",
        howYouThink: "How You Think",
        howYouConnect: "How You Connect",
        whatYouCarry: "What You Carry",
        whatLightsYouUp: "What Lights You Up",
        yourContradictions: "Your Contradictions",
        yourVoice: "Your Voice",
      }
      for (const [key, label] of Object.entries(sectionNames)) {
        if (sections[key]) {
          summary += `## ${label}\n\n${sections[key]}\n\n`
        }
      }
    }
    if (v.crystallizedMoments && Array.isArray(v.crystallizedMoments)) {
      summary += `## Crystallized Moments\n\n`
      for (const m of v.crystallizedMoments as Array<{ quote: string; reflection: string }>) {
        summary += `> "${m.quote}"\n\n*${m.reflection}*\n\n`
      }
    }
  }
  writeFileSync(join(charDir, "soul-file-readable.md"), summary)

  console.log(`  [saved] ${charDir}/`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { file, only, exchanges, softSession } = parseArgs()

  const raw = readFileSync(file, "utf-8")
  let characters: Character[] = JSON.parse(raw)

  if (only) {
    characters = characters.filter((c) => c.name === only)
    if (characters.length === 0) {
      console.error(`Character "${only}" not found in ${file}`)
      process.exit(1)
    }
  }

  const outputDir = join(process.cwd(), "dry-run-output")
  mkdirSync(outputDir, { recursive: true })

  console.log(`\nThumos Soul File Dry Run`)
  console.log(`Characters: ${characters.length}`)
  console.log(`Exchanges per character: ${exchanges}`)
  console.log(`Soft session simulation: ${softSession ? "enabled" : "disabled"}`)
  console.log(`Output: ${outputDir}/\n`)

  const results: Array<{ name: string; succeeded: boolean }> = []

  for (const character of characters) {
    try {
      const { conversation, visibleSoulFile, hiddenSoulFile, synthesisSucceeded } =
        await runCharacter(character, exchanges, softSession)

      saveResults(character, conversation, visibleSoulFile, hiddenSoulFile, outputDir)
      results.push({ name: character.displayName, succeeded: synthesisSucceeded })
    } catch (err) {
      console.error(`\n  [FATAL] ${character.displayName}: ${err}`)
      results.push({ name: character.displayName, succeeded: false })
    }
  }

  // Summary
  console.log(`\n${"═".repeat(60)}`)
  console.log(`  SUMMARY`)
  console.log(`${"═".repeat(60)}\n`)
  for (const r of results) {
    console.log(`  ${r.succeeded ? "✓" : "✗"} ${r.name}`)
  }
  const passed = results.filter((r) => r.succeeded).length
  console.log(`\n  ${passed}/${results.length} soul files generated successfully`)
  console.log(`  Output: ${outputDir}/\n`)
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
