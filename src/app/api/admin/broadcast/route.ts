import { NextRequest, NextResponse } from "next/server";
import { validateAuth, isAdminFid } from "~/lib/auth";
import { getNeynarClient } from "~/lib/neynar";
import { APP_URL } from "~/lib/constants";

export async function POST(request: NextRequest) {
  const auth = await validateAuth(request);
  if (!auth.authenticated || !auth.fid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminFid(auth.fid)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  let title: string;
  let body: string;
  try {
    const json = await request.json();
    title = json.title;
    body = json.body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (!body || typeof body !== "string" || body.trim().length === 0) {
    return NextResponse.json({ error: "Body is required" }, { status: 400 });
  }
  // Neynar/Farcaster notification limits
  if (title.trim().length > 32) {
    return NextResponse.json({ error: "Title must be 32 characters or less" }, { status: 400 });
  }
  if (body.trim().length > 128) {
    return NextResponse.json({ error: "Body must be 128 characters or less" }, { status: 400 });
  }

  let client;
  try {
    client = getNeynarClient();
  } catch (error) {
    console.error("Neynar client error:", error);
    return NextResponse.json(
      { error: "Neynar API not configured" },
      { status: 503 }
    );
  }

  try {
    // Empty targetFids array broadcasts to all users with notifications enabled
    const result = await client.publishFrameNotifications({
      targetFids: [],
      notification: {
        title: title.trim(),
        body: body.trim(),
        target_url: APP_URL,
      },
    });

    const sent = result.notification_deliveries?.length ?? 0;

    console.log(`Broadcast notification: ${sent} delivered`);

    return NextResponse.json({
      success: true,
      sent,
    });
  } catch (error) {
    console.error("Broadcast notification error:", error);
    return NextResponse.json(
      { error: "Failed to send broadcast notification" },
      { status: 500 }
    );
  }
}
