import { NextRequest, NextResponse } from "next/server";
import { sendDailyTrendingNotifications } from "~/lib/notifications";

// This endpoint should be called by Vercel Cron or external scheduler
// Configure in vercel.json: {"crons": [{"path": "/api/cron/daily-notifications", "schedule": "0 9 * * *"}]}

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendDailyTrendingNotifications();

    return NextResponse.json({
      status: "completed",
      notifications_sent: result.sent,
      notifications_failed: result.failed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Daily notification cron error:", error);
    return NextResponse.json(
      { error: "Failed to send daily notifications" },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request);
}
