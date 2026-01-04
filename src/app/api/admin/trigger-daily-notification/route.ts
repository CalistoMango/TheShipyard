import { NextRequest, NextResponse } from "next/server";
import { validateAuth, isAdminFid } from "~/lib/auth";
import { sendDailyTrendingNotifications } from "~/lib/notifications";

export async function POST(request: NextRequest) {
  const auth = await validateAuth(request);
  if (!auth.authenticated || !auth.fid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminFid(auth.fid)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const result = await sendDailyTrendingNotifications();

    return NextResponse.json({
      status: "completed",
      sent: result.sent,
      failed: result.failed,
    });
  } catch (error) {
    console.error("Manual daily notification error:", error);
    return NextResponse.json(
      { error: "Failed to send daily notifications" },
      { status: 500 }
    );
  }
}
