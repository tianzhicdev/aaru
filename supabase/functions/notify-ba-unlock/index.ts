import { jsonResponse } from "../../../src/lib/http.ts";
import { z } from "zod";
import { installEdgeHandler } from "../_shared/edge.ts";
import { getDeviceTokensForUsers } from "../_shared/db.ts";
import { sendBaUnlockNotifications } from "../_shared/apns.ts";

const notifyRequestSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1),
  conversationId: z.string().uuid()
});

export async function handleNotifyBaUnlock(payload: unknown) {
  try {
    const request = notifyRequestSchema.parse(payload);

    // Get device tokens for the users
    const deviceTokenRows = await getDeviceTokensForUsers(request.userIds);

    if (deviceTokenRows.length === 0) {
      console.log(`No device tokens found for users: ${request.userIds.join(", ")}`);
      return jsonResponse(200, {
        sent: 0,
        failed: 0,
        conversationId: request.conversationId,
        message: "No device tokens found"
      });
    }

    // Extract device tokens (filter for iOS/APNS tokens)
    const apnsTokens = deviceTokenRows
      .filter(row => row.platform === "ios" || row.platform === "apns")
      .map(row => row.device_token);

    if (apnsTokens.length === 0) {
      console.log("No APNS device tokens found");
      return jsonResponse(200, {
        sent: 0,
        failed: 0,
        conversationId: request.conversationId,
        message: "No APNS device tokens found"
      });
    }

    // Send push notifications
    const result = await sendBaUnlockNotifications(apnsTokens);

    console.log(`Ba unlock notifications: ${result.sent} sent, ${result.failed} failed`);

    return jsonResponse(200, {
      sent: result.sent,
      failed: result.failed,
      conversationId: request.conversationId,
      totalTokens: apnsTokens.length
    });
  } catch (error) {
    console.error("Error sending Ba unlock notifications:", error);
    return jsonResponse(500, {
      sent: 0,
      failed: 0,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

installEdgeHandler(handleNotifyBaUnlock);