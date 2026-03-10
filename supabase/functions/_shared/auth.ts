import { aaruSessionSecret } from "./env.ts";

const sessionTTLSeconds = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function importHmacKey() {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(aaruSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

export async function hashSessionToken(token: string) {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(token)));
}

export async function issueSessionToken(userId: string, deviceId: string) {
  const nonceBytes = new Uint8Array(18);
  crypto.getRandomValues(nonceBytes);
  const nonce = toHex(nonceBytes.buffer);
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `${userId}.${deviceId}.${issuedAt}.${nonce}`;
  const key = await importHmacKey();
  const signature = toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  const token = `${payload}.${signature}`;
  const expiresAt = new Date((issuedAt + sessionTTLSeconds) * 1000).toISOString();

  return {
    token,
    tokenHash: await hashSessionToken(token),
    expiresAt
  };
}

export function readBearerToken(request: Request) {
  const sessionHeader = request.headers.get("x-aaru-session") ?? request.headers.get("X-AARU-Session");
  if (sessionHeader && sessionHeader.trim().length > 0) {
    return sessionHeader.trim();
  }

  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ", 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim();
}
