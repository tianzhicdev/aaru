import { neon } from "@neondatabase/serverless";
import fs from "node:fs";

const envLines = fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n");
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=]+)=(.+)/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const dbUrl = env.DATABASE_URL_DEV || env.DATABASE_URL;
const sql = neon(dbUrl);

async function main() {
  const hidRows = await sql`SELECT version, status, voice, attachment_assessment, conflict_profile, core_drivers, core_values FROM hidden_soul_files WHERE user_id = 'a0000001-0000-0000-0000-000000000001' AND status = 'ready' LIMIT 1`;
  console.log("Hidden rows:", hidRows.length);
  if (hidRows[0]) {
    console.log("  voice type:", typeof hidRows[0].voice);
    console.log("  voice:", JSON.stringify(hidRows[0].voice).substring(0, 120));
    console.log("  core_drivers:", JSON.stringify(hidRows[0].core_drivers).substring(0, 120));
  }

  // Test Fireworks
  const fwKey = env.FIREWORKS_API_KEY;
  console.log("\nFireworks key present:", Boolean(fwKey));

  const resp = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + fwKey
    },
    body: JSON.stringify({
      model: "accounts/fireworks/models/glm-5",
      messages: [
        { role: "system", content: "You are Luna, a person on a date. Respond with THINK: your thoughts and SPEAK: what you say." },
        { role: "user", content: "You're at a café. Begin the conversation." }
      ],
      max_tokens: 512,
      temperature: 0.7
    })
  });

  console.log("Fireworks status:", resp.status);
  const body = await resp.json();
  if (resp.ok) {
    console.log("Fireworks response:", body.choices?.[0]?.message?.content?.substring(0, 200));
  } else {
    console.log("Fireworks error:", JSON.stringify(body).substring(0, 300));
  }
}

main().catch(e => console.error("Error:", e.message));
