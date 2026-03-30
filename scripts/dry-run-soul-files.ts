#!/usr/bin/env npx tsx
/**
 * dry-run-soul-files.ts
 *
 * CLI client that talks to the deployed Thumos server, simulating characters
 * via Claude to generate soul files for quality review.
 *
 * Usage: npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json
 *        npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json --only fred-rogers
 *        npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json --exchanges 15
 *
 * Optional env: THUMOS_API_BASE=https://api.trythumos.com
 *
 * See scripts/SIMULATION.md for methodology and verification checklist.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import "dotenv/config"

// ── Config ────────────────────────────────────────────────────────────────────

const API_BASE = process.env.THUMOS_API_BASE || "https://api.trythumos.com"

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set in environment or .env")
  process.exit(1)
}

const DEFAULT_EXCHANGES = 15

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

interface RunResult {
  conversation: ConversationTurn[]
  visibleSoulFile: unknown
  hiddenSoulFile: unknown
  synthesisSucceeded: boolean
  reengagementQuestion: string | null
  verificationChecks: VerificationChecks
}

interface VerificationChecks {
  conversationDepth: boolean       // >10 exchanges completed
  conversationBreadth: boolean     // AI asked about ≥3 different domains
  soulFileGenerated: boolean       // visible soul file has portrait + sections
  soulFileSectionsPopulated: number // count of non-empty sections (of 7)
  crystallizedMomentsCount: number
  openThreadsCount: number
  hiddenSoulFileGenerated: boolean
  reengagementWorks: boolean       // got a personalized question
  steeringObserved: boolean        // AI shifted topics during conversation
}

// ── CLI Args ──────────────────────────────────────────────────────────────────

function parseArgs(): { file: string; only?: string; exchanges: number } {
  const args = process.argv.slice(2)
  let file = ""
  let only: string | undefined
  let exchanges = DEFAULT_EXCHANGES

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) file = args[++i]
    else if (args[i] === "--only" && args[i + 1]) only = args[++i]
    else if (args[i] === "--exchanges" && args[i + 1]) exchanges = parseInt(args[++i], 10)
  }

  if (!file) {
    console.error("Usage: npx tsx scripts/dry-run-soul-files.ts --file <characters.json> [--only <name>] [--exchanges <n>]")
    process.exit(1)
  }

  return { file, only, exchanges }
}

// ── HTTP Helpers ──────────────────────────────────────────────────────────────

function serverHeaders(sessionToken?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (sessionToken) {
    h["x-thumos-session"] = sessionToken
  }
  return h
}

async function serverPost(endpoint: string, body: unknown, sessionToken?: string): Promise<Response> {
  const res = await fetch(`${API_BASE}/${endpoint}`, {
    method: "POST",
    headers: serverHeaders(sessionToken),
    body: JSON.stringify(body),
  })
  return res
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
  totalExchanges: number,
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
- By exchange 11+, share the deepest contradictions and things rarely said aloud
- Don't dump everything at once — let the AI's questions guide you
- Keep responses 2-5 sentences (natural conversation length, not monologues)
- You're talking to an AI, so you can be more honest than you might be with a person
- Never break character or mention you're roleplaying
- Use first person ("I", "me", "my")
- CRITICAL: Do NOT include stage directions, actions, or roleplay markers like *leans back*, *pauses*, *looks away*. Real humans typing on a phone don't narrate their body language. Just write what they would actually type.
- If the AI asks about a new topic area, engage with it — don't keep circling the same thing

CURRENT EXCHANGE: ${exchangeNumber} of ~${totalExchanges}
${exchangeNumber <= 3 ? "EARLY: Keep it relatively light, testing the waters." : ""}
${exchangeNumber >= 4 && exchangeNumber <= 7 ? "MIDDLE: Getting more comfortable, starting to share real things." : ""}
${exchangeNumber >= 8 && exchangeNumber <= 11 ? "DEEP: Opening up about core experiences, fears, contradictions." : ""}
${exchangeNumber >= 12 ? "LATE: Most honest and reflective. Saying things you rarely say." : ""}`

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

// ── Synthesis Polling ─────────────────────────────────────────────────────────

async function waitForSynthesis(token: string, maxWaitMs: number = 900000): Promise<{
  visibleSoulFile: unknown
  synthesisSucceeded: boolean
}> {
  const start = Date.now()
  let lastFile: unknown = null
  let pending = true

  while (pending && Date.now() - start < maxWaitMs) {
    const res = await serverPost("get-soul-file", {}, token)
    if (!res.ok) {
      console.error(`  [error] get-soul-file failed: ${res.status}`)
      await new Promise((r) => setTimeout(r, 5000))
      continue
    }

    const data = await res.json() as {
      visible_soul_file: unknown
      version: number
      synthesis_pending: boolean
    }

    lastFile = data.visible_soul_file
    pending = data.synthesis_pending

    if (pending) {
      process.stdout.write(".")
      await new Promise((r) => setTimeout(r, 15000))
    }
  }

  const elapsed = Math.round((Date.now() - start) / 1000)
  if (pending) {
    console.log(` timed out after ${elapsed}s`)
  } else {
    console.log(` done in ${elapsed}s`)
  }

  // Check if the file has actual content
  const v = lastFile as Record<string, unknown> | null
  const hasContent = v?.portrait || (v?.version && (v.version as number) > 0)

  return {
    visibleSoulFile: lastFile,
    synthesisSucceeded: !pending && Boolean(hasContent)
  }
}

// ── Domain Tracking (for verification) ────────────────────────────────────────

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  "relationships": ["relationship", "connect", "friend", "family", "love", "partner", "people", "trust", "lonely"],
  "work/craft": ["work", "create", "build", "craft", "career", "profession", "art", "practice", "skill"],
  "identity": ["identity", "who you are", "define", "label", "see yourself", "think of yourself"],
  "emotions": ["feel", "emotion", "anger", "joy", "sadness", "fear", "happy", "anxious", "peaceful"],
  "values": ["value", "matter", "important", "believe", "principle", "stand for", "care about"],
  "past/memory": ["remember", "childhood", "grew up", "memory", "past", "younger", "used to"],
  "contradictions": ["contradict", "tension", "both", "opposite", "struggle", "torn"],
  "loss/grief": ["loss", "grief", "miss", "gone", "death", "lost", "mourn"],
}

function detectDomains(text: string): string[] {
  const lower = text.toLowerCase()
  return Object.entries(DOMAIN_KEYWORDS)
    .filter(([, keywords]) => keywords.some(k => lower.includes(k)))
    .map(([domain]) => domain)
}

// ── Main Conversation Loop ────────────────────────────────────────────────────

async function runCharacter(character: Character, exchanges: number): Promise<RunResult> {
  console.log(`\n${"═".repeat(60)}`)
  console.log(`  ${character.displayName}`)
  console.log(`${"═".repeat(60)}\n`)

  const domainsCovered = new Set<string>()
  const topicShifts: string[] = []
  let lastDomains: string[] = []

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

  // 2. Ask the API for an opening question
  console.log(`[opening] requesting first question...`)
  const openingRes = await serverPost(
    "soul-converse",
    { mode: "opening" },
    token,
  )
  if (!openingRes.ok) {
    const err = await openingRes.text()
    throw new Error(`Opening failed: ${openingRes.status} ${err}`)
  }

  process.stdout.write(`  Thumos: `)
  let openingText = await readSSEResponse(openingRes)
  console.log()

  // Fallback if Thumos returns empty
  if (!openingText.trim()) {
    openingText = "I'm here to listen — not to fix anything or give advice. Just to understand. What's something about yourself that most people don't see?"
    console.log(`  [fallback] used default opening`)
  }

  // Track domains from AI questions
  const openingDomains = detectDomains(openingText)
  openingDomains.forEach(d => domainsCovered.add(d))
  lastDomains = openingDomains

  const conversation: ConversationTurn[] = [
    { role: "assistant", content: openingText, exchange: 0 },
  ]

  // 3. Exchange loop
  for (let i = 1; i <= exchanges; i++) {
    // Simulate character response
    console.log(`\n  [exchange ${i}/${exchanges}]`)
    process.stdout.write(`  ${character.displayName}: `)
    const charResponse = await simulateCharacterResponse(character, conversation, i, exchanges)
    console.log(charResponse)

    conversation.push({ role: "user", content: charResponse, exchange: i })

    // Track user response domains
    detectDomains(charResponse).forEach(d => domainsCovered.add(d))

    // Send to server
    process.stdout.write(`  Thumos: `)
    const converseRes = await serverPost(
      "soul-converse",
      { mode: "reply", message: charResponse },
      token,
    )

    if (!converseRes.ok) {
      const err = await converseRes.text()
      console.error(`\n  [error] soul-converse failed: ${converseRes.status} ${err}`)
      // Retry once
      console.log(`  [retry] retrying soul-converse...`)
      await new Promise((r) => setTimeout(r, 2000))
      const retryRes = await serverPost("soul-converse", { mode: "reply", message: charResponse }, token)
      if (!retryRes.ok) {
        console.error(`  [error] retry also failed, skipping remaining exchanges`)
        break
      }
      process.stdout.write(`  Thumos: `)
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

    // Track AI question domains and topic shifts
    const currentDomains = detectDomains(thumosResponse)
    currentDomains.forEach(d => domainsCovered.add(d))

    const newDomains = currentDomains.filter(d => !lastDomains.includes(d))
    if (newDomains.length > 0) {
      topicShifts.push(`Exchange ${i}: → ${newDomains.join(", ")}`)
    }
    lastDomains = currentDomains

    // Small delay to be respectful to the server
    await new Promise((r) => setTimeout(r, 500))
  }

  // 4. Trigger synthesis via get-soul-file and poll for completion
  console.log(`\n  [synthesis] triggering via get-soul-file + polling...`)
  process.stdout.write("  [synthesis] waiting")
  const { visibleSoulFile, synthesisSucceeded } = await waitForSynthesis(token)
  console.log(` ${synthesisSucceeded ? "succeeded" : "FAILED"}`)

  // 5. Fetch hidden soul file via debug endpoint
  let hiddenSoulFile: unknown = null
  const debugRes = await serverPost("get-debug-info", {}, token)
  if (!debugRes.ok) {
    const err = await debugRes.text()
    console.error(`  [error] get-debug-info failed: ${debugRes.status} ${err}`)
  } else {
    const debugInfo = await debugRes.json() as {
      hidden_soul_file?: unknown
      visible_soul_file?: unknown
    }
    hiddenSoulFile = debugInfo.hidden_soul_file ?? null
    console.log(`  [fetch] hidden soul file: ${hiddenSoulFile ? "found" : "not found"}`)
  }

  // 6. Test reengagement — simulate a returning user re-opening the app
  //    Uses soul-converse mode:"opening" which generates a personalized
  //    opening question based on the user's soul file + reflection note.
  console.log(`  [reengagement] testing returning-user opening (mode:"opening")...`)
  let reengagementQuestion: string | null = null
  try {
    const reengRes = await serverPost("soul-converse", { mode: "opening" }, token)
    if (reengRes.ok) {
      process.stdout.write(`  [reengagement] `)
      const reengText = await readSSEResponse(reengRes)
      console.log()
      if (reengText && reengText.length > 10) {
        reengagementQuestion = reengText
        console.log(`  [reengagement] personalized opening: "${reengText.slice(0, 100)}..."`)
      } else {
        console.log(`  [reengagement] empty or generic opening`)
      }
    } else {
      const err = await reengRes.text()
      console.log(`  [reengagement] failed: ${reengRes.status} ${err.slice(0, 100)}`)
    }
  } catch (err) {
    console.log(`  [reengagement] error: ${err}`)
  }

  // 7. Verification checks
  const v = visibleSoulFile as Record<string, unknown> | null
  const sections = v?.sections as Record<string, string> | undefined
  const populatedSections = sections
    ? Object.values(sections).filter(s => s && s.length > 0).length
    : 0
  const moments = (v?.crystallizedMoments as unknown[]) ?? []
  const threads = (v?.openThreads as unknown[]) ?? []

  const checks: VerificationChecks = {
    conversationDepth: conversation.filter(t => t.role === "user").length >= 10,
    conversationBreadth: domainsCovered.size >= 3,
    soulFileGenerated: Boolean(v?.portrait),
    soulFileSectionsPopulated: populatedSections,
    crystallizedMomentsCount: moments.length,
    openThreadsCount: threads.length,
    hiddenSoulFileGenerated: Boolean(hiddenSoulFile),
    reengagementWorks: Boolean(reengagementQuestion && reengagementQuestion.length > 10),
    steeringObserved: topicShifts.length >= 2,
  }

  // Print verification summary
  console.log(`\n  ── Verification ──`)
  console.log(`  Domains covered: ${[...domainsCovered].join(", ")} (${domainsCovered.size})`)
  console.log(`  Topic shifts: ${topicShifts.length}`)
  for (const shift of topicShifts.slice(0, 5)) {
    console.log(`    ${shift}`)
  }
  console.log(`  Soul file sections: ${populatedSections}/7`)
  console.log(`  Crystallized moments: ${moments.length}`)
  console.log(`  Open threads: ${threads.length}`)
  console.log(`  Reengagement: ${checks.reengagementWorks ? "✓" : "✗"}`)
  console.log(`  Steering: ${checks.steeringObserved ? "✓" : "✗"}`)

  return {
    conversation,
    visibleSoulFile,
    hiddenSoulFile,
    synthesisSucceeded,
    reengagementQuestion,
    verificationChecks: checks,
  }
}

// ── Output ────────────────────────────────────────────────────────────────────

function saveResults(
  character: Character,
  result: RunResult,
  outputDir: string,
) {
  const charDir = join(outputDir, character.name)
  mkdirSync(charDir, { recursive: true })

  const { conversation, visibleSoulFile, hiddenSoulFile, reengagementQuestion, verificationChecks } = result

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

  // Human-readable soul file summary
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
    if (v.compassScores && typeof v.compassScores === "object") {
      const scores = v.compassScores as Record<string, number | null>
      const filledScores = Object.entries(scores).filter(([, v]) => v != null)
      if (filledScores.length > 0) {
        summary += `## Compass Scores\n\n`
        for (const [axis, score] of filledScores) {
          summary += `- ${axis}: ${score}\n`
        }
        summary += `\n`
      }
    }
  }

  if (reengagementQuestion) {
    summary += `## Re-engagement Question\n\n> ${reengagementQuestion}\n\n`
  }

  // Verification report
  summary += `## Verification\n\n`
  summary += `| Check | Result |\n|-------|--------|\n`
  summary += `| Conversation depth (≥10 user messages) | ${verificationChecks.conversationDepth ? "✓" : "✗"} |\n`
  summary += `| Conversation breadth (≥3 domains) | ${verificationChecks.conversationBreadth ? "✓" : "✗"} |\n`
  summary += `| Soul file generated | ${verificationChecks.soulFileGenerated ? "✓" : "✗"} |\n`
  summary += `| Soul file sections populated | ${verificationChecks.soulFileSectionsPopulated}/7 |\n`
  summary += `| Crystallized moments | ${verificationChecks.crystallizedMomentsCount} |\n`
  summary += `| Open threads | ${verificationChecks.openThreadsCount} |\n`
  summary += `| Hidden soul file | ${verificationChecks.hiddenSoulFileGenerated ? "✓" : "✗"} |\n`
  summary += `| Re-engagement works | ${verificationChecks.reengagementWorks ? "✓" : "✗"} |\n`
  summary += `| Steering observed | ${verificationChecks.steeringObserved ? "✓" : "✗"} |\n`

  writeFileSync(join(charDir, "soul-file-readable.md"), summary)

  console.log(`  [saved] ${charDir}/`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { file, only, exchanges } = parseArgs()

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
  console.log(`API base: ${API_BASE}`)
  console.log(`Output: ${outputDir}/\n`)

  const results: Array<{ name: string; result: RunResult }> = []

  for (const character of characters) {
    try {
      const result = await runCharacter(character, exchanges)
      saveResults(character, result, outputDir)
      results.push({ name: character.displayName, result })
    } catch (err) {
      console.error(`\n  [FATAL] ${character.displayName}: ${err}`)
      results.push({
        name: character.displayName,
        result: {
          conversation: [],
          visibleSoulFile: null,
          hiddenSoulFile: null,
          synthesisSucceeded: false,
          reengagementQuestion: null,
          verificationChecks: {
            conversationDepth: false,
            conversationBreadth: false,
            soulFileGenerated: false,
            soulFileSectionsPopulated: 0,
            crystallizedMomentsCount: 0,
            openThreadsCount: 0,
            hiddenSoulFileGenerated: false,
            reengagementWorks: false,
            steeringObserved: false,
          }
        }
      })
    }
  }

  // Summary
  console.log(`\n${"═".repeat(60)}`)
  console.log(`  SUMMARY`)
  console.log(`${"═".repeat(60)}\n`)

  console.log(`  ${"Character".padEnd(22)} Synth  Sect  Moments  Reeng  Steer`)
  console.log(`  ${"─".repeat(55)}`)
  for (const r of results) {
    const c = r.result.verificationChecks
    console.log(`  ${r.name.padEnd(22)} ${c.soulFileGenerated ? " ✓  " : " ✗  "}  ${String(c.soulFileSectionsPopulated).padStart(2)}/7   ${String(c.crystallizedMomentsCount).padStart(2)}       ${c.reengagementWorks ? "✓" : "✗"}      ${c.steeringObserved ? "✓" : "✗"}`)
  }

  const passed = results.filter((r) => r.result.synthesisSucceeded).length
  const allChecks = results.every(r => {
    const c = r.result.verificationChecks
    return c.soulFileGenerated && c.soulFileSectionsPopulated >= 5 && c.reengagementWorks
  })

  console.log(`\n  ${passed}/${results.length} soul files generated`)
  console.log(`  All checks pass: ${allChecks ? "✓ YES" : "✗ NO"}`)
  console.log(`  Output: ${outputDir}/\n`)
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
