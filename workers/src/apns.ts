// APNs HTTP/2 push client. Uses ES256 JWT bearer auth via the APNs key (.p8).
// Cloudflare Workers' fetch() negotiates HTTP/2 with api.push.apple.com automatically.

export interface ApnsConfig {
  keyP8: string;
  keyId: string;
  teamId: string;
  topic: string;
  useSandbox: boolean;
}

export interface ApnsPayload {
  alert: { title: string; body: string };
  sound?: string;
  badge?: number;
  customData?: Record<string, unknown>;
}

export type ApnsSendOutcome =
  | { ok: true }
  | { ok: false; status: number; reason: string; tokenInvalid: boolean };

export function configFromEnv(env: Record<string, string | undefined>): ApnsConfig | null {
  const keyP8 = env.APNS_KEY_P8;
  const keyId = env.APNS_KEY_ID;
  const teamId = env.APNS_TEAM_ID;
  const topic = env.APNS_TOPIC;
  if (!keyP8 || !keyId || !teamId || !topic) return null;
  return {
    keyP8,
    keyId,
    teamId,
    topic,
    useSandbox: env.APNS_USE_SANDBOX === "true"
  };
}

interface CachedJwt {
  token: string;
  issuedAt: number;
}

let cached: CachedJwt | null = null;
const JWT_REFRESH_MS = 50 * 60 * 1000;

function base64UrlEncode(bytes: Uint8Array | string): string {
  const buf = typeof bytes === "string"
    ? new TextEncoder().encode(bytes)
    : bytes;
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToPkcs8Buffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buffer = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buffer;
}

async function importApnsKey(pem: string): Promise<CryptoKey> {
  const pkcs8 = pemToPkcs8Buffer(pem);
  return crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

async function mintJwt(config: ApnsConfig): Promise<string> {
  const header = { alg: "ES256", kid: config.keyId, typ: "JWT" };
  const iat = Math.floor(Date.now() / 1000);
  const claims = { iss: config.teamId, iat };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;
  const key = await importApnsKey(config.keyP8);
  const sigBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput)
  );
  const signature = base64UrlEncode(new Uint8Array(sigBuffer));
  return `${signingInput}.${signature}`;
}

async function getJwt(config: ApnsConfig): Promise<string> {
  const now = Date.now();
  if (cached && now - cached.issuedAt < JWT_REFRESH_MS) {
    return cached.token;
  }
  const token = await mintJwt(config);
  cached = { token, issuedAt: now };
  return token;
}

export function _resetJwtCacheForTests(): void {
  cached = null;
}

function buildBody(payload: ApnsPayload): string {
  const aps: Record<string, unknown> = {
    alert: payload.alert,
    sound: payload.sound ?? "default"
  };
  if (typeof payload.badge === "number") aps.badge = payload.badge;
  return JSON.stringify({ aps, ...(payload.customData ?? {}) });
}

export async function sendPush(
  config: ApnsConfig,
  deviceToken: string,
  payload: ApnsPayload
): Promise<ApnsSendOutcome> {
  const host = config.useSandbox
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";
  const url = `${host}/3/device/${deviceToken}`;
  const jwt = await getJwt(config);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": config.topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json"
    },
    body: buildBody(payload)
  });

  if (response.status === 200) return { ok: true };

  let reason = "Unknown";
  try {
    const data = (await response.json()) as { reason?: string };
    if (data?.reason) reason = data.reason;
  } catch {
    // body not JSON; ignore
  }

  const tokenInvalid =
    reason === "BadDeviceToken" ||
    reason === "Unregistered" ||
    reason === "DeviceTokenNotForTopic";

  return { ok: false, status: response.status, reason, tokenInvalid };
}
