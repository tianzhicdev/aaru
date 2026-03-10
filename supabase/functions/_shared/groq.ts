import { groqApiKey } from "./env.ts";

interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GroqChatCompletion {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function callGroq(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const apiKey = groqApiKey();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY not configured");
  }

  const groqMessages: GroqMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((msg): GroqMessage => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content
    }))
  ];

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: groqMessages,
      max_tokens: 150, // Keep replies short for Ka conversations
      temperature: 0.8
    })
  });

  if (!response.ok) {
    throw new Error(`Groq API error ${response.status}: ${await response.text()}`);
  }

  const completion: GroqChatCompletion = await response.json();

  if (completion.choices.length === 0) {
    throw new Error("No response from Groq API");
  }

  return completion.choices[0].message.content.trim();
}