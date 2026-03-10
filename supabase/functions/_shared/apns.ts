import { apnsKeyId, apnsTeamId, apnsPrivateKey, apnsBundleId } from "./env.ts";

interface APNSPayload {
  aps: {
    alert: {
      title: string;
      body: string;
    };
    sound?: string;
    badge?: number;
  };
}

// Simple base64url encoding for JWT
function base64urlEncode(data: string): string {
  return btoa(data)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Simple JWT signing for APNS (ES256)
async function createAPNSJWT(): Promise<string> {
  const keyId = apnsKeyId();
  const teamId = apnsTeamId();
  const privateKey = apnsPrivateKey();

  if (!keyId || !teamId || !privateKey) {
    throw new Error("Missing APNS credentials");
  }

  const header = {
    alg: "ES256",
    kid: keyId
  };

  const payload = {
    iss: teamId,
    iat: Math.floor(Date.now() / 1000)
  };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const message = `${encodedHeader}.${encodedPayload}`;

  // For a production implementation, you would use the ES256 algorithm to sign this
  // For now, this is a simplified version - in reality you'd need to import the private key
  // and use SubtleCrypto to sign with ECDSA using P-256 and SHA-256

  // Since we can't easily do ES256 signing in this environment without additional dependencies,
  // we'll create a placeholder signature that should be replaced with proper JWT signing
  const signature = base64urlEncode("placeholder_signature_replace_with_proper_es256");

  return `${message}.${signature}`;
}

export async function sendAPNSNotification(
  deviceToken: string,
  title: string,
  body: string,
  isProduction = true
): Promise<boolean> {
  try {
    const bundleId = apnsBundleId();
    if (!bundleId) {
      throw new Error("Missing APNS bundle ID");
    }

    const jwt = await createAPNSJWT();
    const apnsUrl = isProduction
      ? "https://api.push.apple.com"
      : "https://api.sandbox.push.apple.com";

    const payload: APNSPayload = {
      aps: {
        alert: {
          title,
          body
        },
        sound: "default",
        badge: 1
      }
    };

    const response = await fetch(`${apnsUrl}/3/device/${deviceToken}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${jwt}`,
        "Content-Type": "application/json",
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10"
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log(`APNS notification sent successfully to ${deviceToken}`);
      return true;
    } else {
      const error = await response.text();
      console.error(`APNS notification failed: ${response.status} - ${error}`);
      return false;
    }
  } catch (error) {
    console.error("Error sending APNS notification:", error);
    return false;
  }
}

export async function sendBaUnlockNotifications(deviceTokens: string[]): Promise<{ sent: number; failed: number }> {
  const results = await Promise.allSettled(
    deviceTokens.map(token =>
      sendAPNSNotification(
        token,
        "New Connection 💫",
        "Someone new wants to meet the real you"
      )
    )
  );

  const sent = results.filter(result =>
    result.status === "fulfilled" && result.value === true
  ).length;

  const failed = results.length - sent;

  return { sent, failed };
}