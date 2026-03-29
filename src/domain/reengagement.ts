import type { HiddenSoulFile, VisibleSoulFile } from "./schemas.ts";

export interface ReengagementQuestion {
  notificationText: string;  // under 100 chars for push notification
  fullQuestion: string;      // full version for in-app display
  threadReference: string;   // which open thread this connects to
}

/**
 * Build a prompt for Haiku to generate a personalized re-engagement question.
 * Uses the user's hidden soul file (clinical insights), recent messages, and open threads.
 */
export function buildReengagementPrompt(
  hiddenSoulFile: HiddenSoulFile | null,
  visibleSoulFile: VisibleSoulFile | null,
  recentMessages: Array<{ role: string; content: string }>,
): string {
  const openThreads = visibleSoulFile?.openThreads ?? [];
  const portrait = visibleSoulFile?.portrait ?? "";

  const hiddenContext = hiddenSoulFile
    ? `
Core drivers: ${JSON.stringify(hiddenSoulFile.coreDrivers.map(d => d.driver))}
Depth map - safe entry points: ${JSON.stringify(hiddenSoulFile.depthMap.safeEntryPoints)}
Depth map - unlock topics: ${JSON.stringify(hiddenSoulFile.depthMap.unlockTopics)}
Depth map - currently live topics: ${JSON.stringify(hiddenSoulFile.depthMap.currentlyLiveTopics)}
Contradictions observed: ${hiddenSoulFile.analystNotes.slice(-3).join("; ")}
Core values: ${JSON.stringify(hiddenSoulFile.coreValues)}`
    : "No hidden soul file yet — this is an early-stage user.";

  const messagesContext = recentMessages.length > 0
    ? recentMessages.slice(-5).map(m =>
        `${m.role === "assistant" ? "Thumos" : "User"}: ${m.content}`
      ).join("\n")
    : "No recent messages available.";

  const threadsContext = openThreads.length > 0
    ? `Open threads (unresolved curiosities): ${JSON.stringify(openThreads)}`
    : "No open threads yet.";

  return `You are generating a personalized re-engagement question for a soul-exploration app called Thumos.
The user has been away for a few days. Your job: craft ONE question that feels like it comes from someone who truly knows them. The question should gently pull them back into self-reflection.

USER CONTEXT:
Portrait: ${portrait || "(no portrait yet)"}
${threadsContext}
${hiddenContext}

RECENT CONVERSATION:
${messagesContext}

INSTRUCTIONS:
1. Generate a single warm, personal question that references something specific they've shared.
2. Aim to gently probe a tension, an open thread, or something they circled but didn't fully explore.
3. The question should feel like a friend who remembers everything — not a therapist, not a bot.
4. If open threads exist, prefer to reference one of them.
5. For users with no soul file yet, use a universal but evocative question.

OUTPUT FORMAT (JSON only):
{
  "notificationText": "Short version under 100 characters for push notification",
  "fullQuestion": "The complete, warm question for in-app display (can be longer)",
  "threadReference": "Which open thread or theme this connects to, or 'general' if none"
}

Rules:
- notificationText MUST be under 100 characters
- Use second person (you/your)
- No emoji
- No generic self-help language
- Respond with ONLY valid JSON, no markdown, no explanation.`;
}

/**
 * Parse the Haiku response into a structured ReengagementQuestion.
 */
export function parseReengagementQuestion(raw: string): ReengagementQuestion | null {
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (typeof parsed.notificationText !== "string" || typeof parsed.fullQuestion !== "string") {
      return null;
    }

    return {
      notificationText: parsed.notificationText.slice(0, 100),
      fullQuestion: parsed.fullQuestion.slice(0, 500),
      threadReference: typeof parsed.threadReference === "string" ? parsed.threadReference : "general"
    };
  } catch {
    return null;
  }
}

/**
 * Fallback questions when Claude is unavailable or for users with minimal data.
 * These are deep, universal questions that work without personalization.
 */
const FALLBACK_QUESTIONS: ReengagementQuestion[] = [
  {
    notificationText: "What's something you've been carrying quietly this week?",
    fullQuestion: "What's something you've been carrying quietly this week? Sometimes the things we don't say out loud are the ones that matter most.",
    threadReference: "general"
  },
  {
    notificationText: "When did you last surprise yourself?",
    fullQuestion: "When did you last surprise yourself? Not a big moment necessarily — just a time you acted differently than you expected.",
    threadReference: "general"
  },
  {
    notificationText: "What's a question you've been avoiding?",
    fullQuestion: "What's a question you've been avoiding? Not because you don't know the answer, but because you might.",
    threadReference: "general"
  },
  {
    notificationText: "Who did you think you'd be by now?",
    fullQuestion: "Who did you think you'd be by now? And how do you feel about the distance between that person and who you actually became?",
    threadReference: "general"
  },
  {
    notificationText: "What do you keep coming back to in your mind lately?",
    fullQuestion: "What do you keep coming back to in your mind lately? The things that orbit us tend to be trying to tell us something.",
    threadReference: "general"
  },
  {
    notificationText: "What would you do differently if nobody was watching?",
    fullQuestion: "What would you do differently if nobody was watching? Not the big dramatic changes — the small honest ones.",
    threadReference: "general"
  },
  {
    notificationText: "What's something true about you that's hard to explain?",
    fullQuestion: "What's something true about you that's hard to explain to other people? The parts of us that resist easy description are often the most interesting.",
    threadReference: "general"
  },
  {
    notificationText: "Where do you feel most like yourself?",
    fullQuestion: "Where do you feel most like yourself? Not the version others expect — the one that shows up when you stop performing.",
    threadReference: "general"
  },
  {
    notificationText: "What have you outgrown but haven't let go of yet?",
    fullQuestion: "What have you outgrown but haven't let go of yet? Sometimes we hold onto things not because we need them, but because letting go feels like losing a part of ourselves.",
    threadReference: "general"
  },
  {
    notificationText: "What's the kindest thing someone said to you recently?",
    fullQuestion: "What's the kindest thing someone said to you recently? And did you believe them when they said it?",
    threadReference: "general"
  },
  {
    notificationText: "What conversation are you replaying in your head?",
    fullQuestion: "What conversation are you replaying in your head? The ones we rehearse usually have something left unsaid.",
    threadReference: "general"
  },
  {
    notificationText: "What part of your day feels most like you chose it?",
    fullQuestion: "What part of your day feels most like you chose it — as opposed to something that just happened to you?",
    threadReference: "general"
  }
];

/**
 * Get a deterministic fallback question based on user ID (ensures variety across users).
 */
export function getReengagementFallback(userId?: string): ReengagementQuestion {
  if (!userId) {
    return FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
  }
  // Simple hash of user ID to pick a consistent-ish but rotating question
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  // Add day-of-year for weekly rotation
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const weekNumber = Math.floor(dayOfYear / 7);
  const index = Math.abs(hash + weekNumber) % FALLBACK_QUESTIONS.length;
  return FALLBACK_QUESTIONS[index];
}
