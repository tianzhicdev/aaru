const base = process.env.THUMOS_API_BASE_URL || "https://api.trythumos.com";

async function post(path, body = {}, token) {
  const response = await fetch(`${base}/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-thumos-session": token } : {})
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return { status: response.status, json, text };
}

async function converse(body, token) {
  const response = await fetch(`${base}/soul-converse`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
      "x-thumos-session": token
    },
    body: JSON.stringify(body)
  });

  if (!response.ok || !response.body) {
    throw new Error(`SSE failed: ${response.status} ${await response.text()}`);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "message";
  let fullText = "";

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    while (buffer.includes("\n\n")) {
      const index = buffer.indexOf("\n\n");
      const frame = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);

      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
          continue;
        }

        if (!line.startsWith("data: ")) {
          continue;
        }

        const payload = JSON.parse(line.slice(6));
        if (currentEvent === "token" && payload.text) {
          fullText += payload.text;
        }
      }

      currentEvent = "message";
    }
  }

  return fullText.trim();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitFor(condition, { attempts, delayMs }) {
  let lastValue = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    lastValue = await condition();
    if (lastValue.done) {
      return lastValue.value;
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const error = new Error(lastValue?.error || "Timed out");
  error.lastValue = lastValue?.value ?? null;
  throw error;
}

async function main() {
  const summary = {};

  const version = await post("version", { build_version: "1.0.0" });
  assert(version.status === 200, `Version check failed: ${version.status}`);
  summary.version = version.json;

  const existingDevice = "b55c0e43-135f-45ef-85ce-9e37e1ebd54e";
  const existingBootstrap = await post("bootstrap-soul", { device_id: existingDevice });
  assert(existingBootstrap.status === 200 && existingBootstrap.json.token, "Existing bootstrap failed");
  const existingToken = existingBootstrap.json.token;

  const [existingSync, existingDump, existingSoulFile] = await Promise.all([
    post("sync-messages", {}, existingToken),
    post("debug-dump", {}, existingToken),
    post("get-soul-file", {}, existingToken)
  ]);

  assert(existingSync.status === 200, `Existing sync failed: ${existingSync.status}`);
  assert(existingDump.status === 200, `Existing debug-dump failed: ${existingDump.status}`);
  assert(existingSync.json.messages.length > 10, "Existing sync did not return full history");

  summary.existingConversation = {
    device: existingDevice,
    syncedMessages: existingSync.json.messages.length,
    hasReflectionNote: !!existingDump.json.reflection_note,
    hasLatestConversationTrace: !!existingDump.json.latest_conversation_trace,
    hasLatestSynthesisTrace: !!existingDump.json.latest_synthesis_trace,
    hasLatestReflectionTrace: !!existingDump.json.latest_reflection_trace,
    synthesisPending: existingSoulFile.json.synthesis_pending
  };

  const deviceId = `verify-${Date.now()}`;
  console.error(`Fresh verification device: ${deviceId}`);
  const bootstrap = await post("bootstrap-soul", { device_id: deviceId });
  assert(bootstrap.status === 200 && bootstrap.json.token, "Fresh bootstrap failed");
  const token = bootstrap.json.token;

  const opening = await converse({ mode: "opening" }, token);
  assert(opening.length > 0, "Opening returned empty text");

  const prompts = [
    "Work feels off lately and I keep avoiding a decision about what to do next.",
    "I miss making music, but I have not touched it in years and I do not fully know why.",
    "My family expects stability, and part of me resents how much that shapes my choices.",
    "I keep telling people I am fine, but I feel restless almost every day.",
    "Part of me wants to leave New York and start over somewhere quieter."
  ];

  const replyPreviews = [];
  for (const message of prompts) {
    const reply = await converse({ mode: "reply", message }, token);
    assert(reply.length > 0, `Reply returned empty text for prompt: ${message}`);
    replyPreviews.push(reply.slice(0, 120));
  }

  const synced = await post("sync-messages", {}, token);
  assert(synced.status === 200, `Fresh sync failed: ${synced.status}`);
  assert(synced.json.messages.length >= 11, `Expected at least 11 synced messages, got ${synced.json.messages.length}`);

  const initialSoulFile = await post("get-soul-file", {}, token);
  assert(initialSoulFile.status === 200, `Initial get-soul-file failed: ${initialSoulFile.status}`);

  const readySoulFile = await waitFor(async () => {
    const result = await post("get-soul-file", {}, token);
    const ready = !!result.json.visible_soul_file?.portrait && result.json.synthesis_pending === false;
    return {
      done: ready,
      value: result.json,
      error: "Soul file did not become ready within the polling window"
    };
  }, { attempts: 48, delayMs: 5000 });

  const dump = await waitFor(async () => {
    const result = await post("debug-dump", {}, token);
    const ready = !!result.json.reflection_note
      && !!result.json.latest_conversation_trace
      && !!result.json.latest_synthesis_trace
      && !!result.json.latest_reflection_trace;
    return {
      done: ready,
      value: result.json,
      error: "Debug dump traces/reflection note were not ready within the polling window"
    };
  }, { attempts: 24, delayMs: 5000 });

  summary.freshConversation = {
    device: deviceId,
    openingPreview: opening.slice(0, 120),
    replyPreviews,
    syncedMessages: synced.json.messages.length,
    firstSoulFilePending: initialSoulFile.json.synthesis_pending,
    soulFilePortrait: readySoulFile.visible_soul_file.portrait,
    hasReflectionNote: !!dump.reflection_note,
    reflectionThroughCount: dump.reflection_snapshot_row?.through_message_count ?? null,
    conversationTraceModel: dump.latest_conversation_trace?.model ?? null,
    synthesisTraceModel: dump.latest_synthesis_trace?.model ?? null,
    reflectionTraceModel: dump.latest_reflection_trace?.model ?? null
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  if (error && typeof error === "object" && "lastValue" in error && error.lastValue) {
    console.error(JSON.stringify(error.lastValue, null, 2));
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
