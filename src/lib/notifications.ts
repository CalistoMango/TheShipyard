import { createServerClient } from "./supabase";
import { sendMiniAppNotification } from "./notifs";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const NEYNAR_SIGNER_UUID = process.env.NEYNAR_SIGNER_UUID;

export type NotificationType =
  | "idea_funded"
  | "race_mode_started"
  | "build_submitted"
  | "voting_started"
  | "voting_ended"
  | "payout_received"
  | "daily_trending";

interface NotificationPayload {
  type: NotificationType;
  recipientFid: number;
  data: Record<string, unknown>;
}

/**
 * Send a Farcaster direct cast notification via Neynar
 */
export async function sendDirectCast(
  recipientFid: number,
  message: string
): Promise<{ success: boolean; error?: string }> {
  if (!NEYNAR_API_KEY || !NEYNAR_SIGNER_UUID) {
    console.log("Neynar not configured, skipping direct cast");
    return { success: false, error: "Neynar not configured" };
  }

  try {
    const response = await fetch("https://api.neynar.com/v2/farcaster/cast", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        api_key: NEYNAR_API_KEY,
      },
      body: JSON.stringify({
        signer_uuid: NEYNAR_SIGNER_UUID,
        text: message,
        parent_url: undefined,
        // Direct cast to user by mentioning them
        embeds: [],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Neynar cast error:", error);
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    console.error("Send direct cast error:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Send a notification to a user via miniapp (push notification)
 */
export async function sendPushNotification(
  fid: number,
  title: string,
  body: string
): Promise<{ success: boolean; state: string }> {
  const result = await sendMiniAppNotification({ fid, title, body });
  return {
    success: result.state === "success",
    state: result.state,
  };
}

/**
 * Build notification message based on type
 */
function buildNotificationMessage(payload: NotificationPayload): {
  title: string;
  body: string;
  castMessage?: string;
} {
  const { type, data } = payload;

  switch (type) {
    case "idea_funded":
      return {
        title: "Your idea got funded! 💰",
        body: `Someone funded "${data.ideaTitle}" with $${data.amount}. Pool is now $${data.newPool}.`,
        castMessage: `Your idea "${data.ideaTitle}" just got funded with $${data.amount}! 🎉 Pool: $${data.newPool}`,
      };

    case "race_mode_started":
      return {
        title: "Race Mode Started! 🏁",
        body: `"${data.ideaTitle}" hit $${data.pool} and is now in race mode!`,
        castMessage: `Race mode activated for "${data.ideaTitle}"! 🏁 $${data.pool} pool ready to be claimed.`,
      };

    case "build_submitted":
      return {
        title: "New Build Submitted 🔨",
        body: `A builder submitted a build for "${data.ideaTitle}".`,
      };

    case "voting_started":
      return {
        title: "Vote Now! 🗳️",
        body: `Voting is open for a build on "${data.ideaTitle}". 48h to vote.`,
        castMessage: `Voting is now open for a build on "${data.ideaTitle}"! Cast your vote in the next 48 hours. 🗳️`,
      };

    case "voting_ended":
      return {
        title: "Voting Ended",
        body: `Voting ended for "${data.ideaTitle}". ${data.approved ? "Build approved!" : "Build rejected."}`,
      };

    case "payout_received":
      return {
        title: "Payout Received! 💸",
        body: `You earned $${data.amount} from "${data.ideaTitle}"!`,
        castMessage: `Congrats! You earned $${data.amount} from "${data.ideaTitle}"! 💸`,
      };

    case "daily_trending":
      return {
        title: "🔥 Today's Hot Ideas",
        body: `Check out what's trending on The Shipyard! ${data.count} ideas need builders.`,
        castMessage: `🔥 ${data.count} ideas are trending on The Shipyard today! Top pool: $${data.topPool}. Come build and earn!`,
      };

    default:
      return {
        title: "The Shipyard",
        body: "You have a new notification.",
      };
  }
}

/**
 * Send notification to a user
 */
export async function sendNotification(
  payload: NotificationPayload
): Promise<{ push: boolean; cast: boolean }> {
  const message = buildNotificationMessage(payload);

  // Try push notification first
  const pushResult = await sendPushNotification(
    payload.recipientFid,
    message.title,
    message.body
  );

  // Cast notification is optional (for important events)
  const castResult = { success: false };
  if (message.castMessage) {
    // For now, we log instead of casting to avoid spam
    console.log(`Would cast to fid:${payload.recipientFid}: ${message.castMessage}`);
    // TODO: Enable casting when ready
    // const result = await sendDirectCast(payload.recipientFid, message.castMessage);
    // castResult.success = result.success;
  }

  return {
    push: pushResult.success,
    cast: castResult.success,
  };
}

/**
 * Get all users who have enabled notifications
 */
export async function getNotifiableUsers(): Promise<number[]> {
  const supabase = createServerClient();

  // Get all users (in production, filter by notification preferences)
  const { data: users } = await supabase
    .from("users")
    .select("fid")
    .not("fid", "is", null);

  return users?.map((u) => u.fid) || [];
}

/**
 * Send daily trending notification to all users
 */
export async function sendDailyTrendingNotifications(): Promise<{
  sent: number;
  failed: number;
}> {
  const supabase = createServerClient();

  // Get trending stats
  const { data: ideas } = await supabase
    .from("ideas")
    .select("pool")
    .eq("status", "open")
    .order("pool", { ascending: false })
    .limit(10);

  const openIdeasCount = ideas?.length || 0;
  const topPool = ideas?.[0]?.pool ? Number(ideas[0].pool) : 0;

  if (openIdeasCount === 0) {
    console.log("No open ideas, skipping daily notification");
    return { sent: 0, failed: 0 };
  }

  const users = await getNotifiableUsers();
  let sent = 0;
  let failed = 0;

  for (const fid of users) {
    const result = await sendNotification({
      type: "daily_trending",
      recipientFid: fid,
      data: {
        count: openIdeasCount,
        topPool,
      },
    });

    if (result.push) {
      sent++;
    } else {
      failed++;
    }
  }

  console.log(`Daily trending notifications: ${sent} sent, ${failed} failed`);
  return { sent, failed };
}
