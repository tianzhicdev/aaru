#!/usr/bin/env -S node --experimental-strip-types
// Send an admin message to a user. Appears in their Thumos chat with a push notification.
//
// Usage:
//   ADMIN_TOKEN=... THUMOS_API=https://api.thumos.dev \
//     node --experimental-strip-types scripts/send-admin-message.ts <user_id> "<message>"

const apiBase = process.env.THUMOS_API;
const adminToken = process.env.ADMIN_TOKEN;

if (!apiBase) {
  console.error("Missing THUMOS_API env var (e.g. https://api.thumos.dev)");
  process.exit(1);
}
if (!adminToken) {
  console.error("Missing ADMIN_TOKEN env var");
  process.exit(1);
}

const [, , userId, ...messageParts] = process.argv;
const message = messageParts.join(" ").trim();

if (!userId || !message) {
  console.error("Usage: send-admin-message.ts <user_id> <message>");
  process.exit(1);
}

const url = `${apiBase.replace(/\/+$/, "")}/admin/send-message`;

const response = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-thumos-admin-token": adminToken
  },
  body: JSON.stringify({ user_id: userId, content: message })
});

const body = await response.text();
if (!response.ok) {
  console.error(`Failed (${response.status}): ${body}`);
  process.exit(1);
}
console.log(body);
