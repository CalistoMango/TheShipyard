import { NextRequest, NextResponse } from "next/server";
import { sendDailyTrendingNotifications } from "~/lib/notifications";
import { refreshAllProfiles } from "~/lib/user";

// This endpoint should be called by Vercel Cron or external scheduler
// Configure in vercel.json: {"crons": [{"path": "/api/cron/daily-notifications", "schedule": "0 15 * * *"}]}

// SECURITY WARNING: Log if CRON_SECRET is not set
if (!process.env.CRON_SECRET) {
  console.warn("[SECURITY] CRON_SECRET not set - /api/cron/* endpoints are PUBLIC");
}

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Refresh user profiles first
    const profileResult = await refreshAllProfiles();

    // Then send notifications
    const result = await sendDailyTrendingNotifications();

    return NextResponse.json({
      status: "completed",
      profiles_refreshed: profileResult.updated,
      profiles_failed: profileResult.failed,
      profiles_total: profileResult.total,
      notifications_sent: result.sent,
      notifications_failed: result.failed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Daily notification cron error:", error);
    return NextResponse.json(
      { error: "Failed to run daily cron" },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request);
}
