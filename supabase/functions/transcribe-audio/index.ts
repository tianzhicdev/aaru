import { jsonResponse } from "../../../src/lib/http.ts";
import { transcribeAudioRequestSchema, transcribeAudioResponseSchema } from "../_shared/contracts.ts";
import { installEdgeHandler } from "../_shared/edge.ts";
import { groqApiKey } from "../_shared/env.ts";

export async function handleTranscribeAudio(payload: unknown, _request: Request) {
  const body = transcribeAudioRequestSchema.parse(payload);

  const apiKey = groqApiKey();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY not configured");
  }

  const binaryString = atob(body.audio_base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: body.mime_type });

  const form = new FormData();
  form.append("file", blob, "audio.m4a");
  form.append("model", "whisper-large-v3");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  if (!response.ok) {
    throw new Error(`Groq Whisper API error ${response.status}: ${await response.text()}`);
  }

  const result = await response.json();
  return jsonResponse(200, transcribeAudioResponseSchema.parse({ transcript: result.text ?? "" }));
}

installEdgeHandler(handleTranscribeAudio);
