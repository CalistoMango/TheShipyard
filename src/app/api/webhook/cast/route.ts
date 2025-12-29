import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// Neynar webhook secret for signature verification
const NEYNAR_WEBHOOK_SECRET = process.env.NEYNAR_WEBHOOK_SECRET;

interface NeynarCastWebhook {
  created_at: number;
  type: "cast.created";
  data: {
    object: "cast";
    hash: string;
    thread_hash: string;
    parent_hash: string | null;
    parent_url: string | null;
    root_parent_url: string | null;
    parent_author: {
      fid: number | null;
    };
    author: {
      object: "user";
      fid: number;
      custody_address: string;
      username: string;
      display_name: string;
      pfp_url: string;
    };
    text: string;
    timestamp: string;
    embeds: Array<{ url?: string }>;
    channel: {
      object: "channel_dehydrated";
      id: string;
      name: string;
      image_url: string;
    } | null;
  };
}

function verifyNeynarSignature(
  payload: string,
  signature: string | null
): boolean {
  if (!NEYNAR_WEBHOOK_SECRET || !signature) {
    // In development without secret, allow all requests
    if (process.env.NODE_ENV === "development") {
      return true;
    }
    return false;
  }

  const hmac = crypto.createHmac("sha512", NEYNAR_WEBHOOK_SECRET);
  hmac.update(payload);
  const computedSignature = hmac.digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(computedSignature),
    Buffer.from(signature)
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-neynar-signature");

  // Verify webhook signature
  if (!verifyNeynarSignature(rawBody, signature)) {
    console.error("Invalid Neynar webhook signature");
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  let webhookData: NeynarCastWebhook;
  try {
    webhookData = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  // Only process cast.created events
  if (webhookData.type !== "cast.created") {
    return NextResponse.json({
      status: "skipped",
      reason: `Unsupported event type: ${webhookData.type}`,
    });
  }

  const cast = webhookData.data;

  // Verify this cast is from the /someone-build channel
  const targetChannel = process.env.FARCASTER_CHANNEL_ID || "someone-build";
  if (cast.channel?.id !== targetChannel) {
    return NextResponse.json({
      status: "skipped",
      reason: `Cast not from ${targetChannel} channel`,
    });
  }

  // Skip replies - we only want top-level casts
  if (cast.parent_hash) {
    return NextResponse.json({
      status: "skipped",
      reason: "Skipping reply cast",
    });
  }

  // Forward to the ingest endpoint
  const ingestUrl = new URL("/api/ingest", request.url);

  try {
    const ingestResponse = await fetch(ingestUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cast_hash: cast.hash,
        cast_text: cast.text,
        author_fid: cast.author.fid,
        author_username: cast.author.username,
        author_display_name: cast.author.display_name,
      }),
    });

    const result = await ingestResponse.json();

    return NextResponse.json({
      status: "processed",
      cast_hash: cast.hash,
      ingest_result: result,
    });
  } catch (error) {
    console.error("Error forwarding to ingest endpoint:", error);
    return NextResponse.json(
      { error: "Failed to process cast" },
      { status: 500 }
    );
  }
}
