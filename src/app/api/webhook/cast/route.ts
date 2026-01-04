import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getNeynarClient } from "~/lib/neynar";

// Neynar webhook secret for signature verification
const NEYNAR_WEBHOOK_SECRET = process.env.NEYNAR_WEBHOOK_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_URL || "https://the-shipyard.vercel.app";
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const NEYNAR_AGENT_SIGNER_UUID = process.env.NEYNAR_AGENT_SIGNER_UUID;
// Internal secret for webhook -> ingest calls
const INGEST_SECRET = process.env.INGEST_SECRET;

// Detect @theshipyard mentions (case insensitive)
const MENTION_PATTERN = /@theshipyard\b/i;

// Share casts from the app start with this pattern (see IdeaDetail.tsx getShareText)
const SHARE_TEXT_PATTERN = /^Check out "[^"]+" by @?\w+ on @theshipyard!/i;

/**
 * Detects if a cast is sharing an existing Shipyard idea.
 * Must match BOTH: the share text pattern AND embed a Shipyard idea URL.
 * This prevents false positives where someone submits a new idea that references an existing one.
 */
function isShareCast(text: string, embeds: Array<{ url?: string }>): boolean {
  // First check if text matches the share pattern from the app
  if (!SHARE_TEXT_PATTERN.test(text)) {
    return false;
  }

  // Use origin comparison to prevent spoofing (e.g., the-shipyard.vercel.app.evil.com)
  let appOrigin: string;
  try {
    appOrigin = new URL(APP_URL).origin;
  } catch {
    return false;
  }

  return embeds.some((embed) => {
    if (!embed.url) return false;
    try {
      const url = new URL(embed.url);
      const ideaId = url.searchParams.get("idea");
      // Compare origins to ensure exact domain match
      return ideaId && url.origin === appOrigin;
    } catch {
      return false;
    }
  });
}

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

  try {
    const hmac = crypto.createHmac("sha512", NEYNAR_WEBHOOK_SECRET);
    hmac.update(payload);
    const computedSignature = hmac.digest("hex");

    // Validate signature format and length before comparison
    // timingSafeEqual throws if buffers have different lengths
    const computedBuffer = Buffer.from(computedSignature, "utf8");
    const signatureBuffer = Buffer.from(signature, "utf8");

    if (computedBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(computedBuffer, signatureBuffer);
  } catch {
    // Handle malformed signatures gracefully
    return false;
  }
}

async function replyToCast(parentHash: string, text: string): Promise<boolean> {
  if (!NEYNAR_API_KEY || !NEYNAR_AGENT_SIGNER_UUID) {
    console.log("[WEBHOOK] Missing Neynar credentials, skipping reply");
    return false;
  }

  try {
    const response = await fetch("https://api.neynar.com/v2/farcaster/cast", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "x-api-key": NEYNAR_API_KEY,
      },
      body: JSON.stringify({
        signer_uuid: NEYNAR_AGENT_SIGNER_UUID,
        text,
        parent: parentHash,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[WEBHOOK] Failed to reply to cast:", error);
      return false;
    }

    console.log("[WEBHOOK] Successfully replied to cast");
    return true;
  } catch (error) {
    console.error("[WEBHOOK] Error replying to cast:", error);
    return false;
  }
}

async function fetchParentCast(parentHash: string) {
  try {
    const client = getNeynarClient();
    const response = await client.lookupCastByHashOrWarpcastUrl({
      identifier: parentHash,
      type: "hash",
    });
    return response.cast;
  } catch (error) {
    console.error("[WEBHOOK] Error fetching parent cast:", error);
    return null;
  }
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
  const targetChannel = process.env.FARCASTER_CHANNEL_ID || "someone-build";
  const ingestUrl = new URL("/api/ingest", request.url);
  const isFromTargetChannel = cast.channel?.id === targetChannel;

  // Check if this cast mentions @theshipyard
  const hasMention = MENTION_PATTERN.test(cast.text);
  // Only treat as mention if NOT from the target channel (channel posts are processed normally)
  const isReplyMention = hasMention && cast.parent_hash && !isFromTargetChannel;
  const isDirectMention = hasMention && !cast.parent_hash && !isFromTargetChannel;

  // Case 1: Reply mentioning @theshipyard (outside /someone-build) - import the parent cast as an idea
  if (isReplyMention) {
    // Check if this is a share cast (sharing an existing idea)
    if (isShareCast(cast.text, cast.embeds)) {
      console.log("[WEBHOOK] Detected share cast in reply mention, sending thank you");
      await replyToCast(
        cast.hash,
        "Thanks for sharing this idea! 🚢 Your support helps great ideas get built."
      );
      return NextResponse.json({
        status: "skipped",
        reason: "Share cast - existing idea being shared",
      });
    }

    console.log("[WEBHOOK] Detected @theshipyard mention in reply");

    // Fetch the parent cast that's being tagged as an idea
    const parentCast = await fetchParentCast(cast.parent_hash!);

    if (!parentCast) {
      // Reply to let them know we couldn't fetch the parent
      await replyToCast(
        cast.hash,
        "Sorry, I couldn't fetch the cast you're tagging. Please try again or post the idea directly in /someone-build."
      );
      return NextResponse.json({
        status: "error",
        reason: "Failed to fetch parent cast",
      });
    }

    // Don't import if the parent cast is already from the someone-build channel
    // (it would already be processed by the channel webhook)
    if (parentCast.channel?.id === targetChannel) {
      return NextResponse.json({
        status: "skipped",
        reason: "Parent cast is already in /someone-build channel",
      });
    }

    // Forward parent cast to ingest endpoint
    try {
      const ingestResponse = await fetch(ingestUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(INGEST_SECRET && { "x-ingest-secret": INGEST_SECRET }),
        },
        body: JSON.stringify({
          cast_hash: parentCast.hash,
          cast_text: parentCast.text,
          author_fid: parentCast.author.fid,
          author_username: parentCast.author.username,
          author_display_name: parentCast.author.display_name,
        }),
      });

      const result = await ingestResponse.json();

      // Reply to the person who tagged us
      if (result.status === "created") {
        const ideaUrl = `${APP_URL}/?idea=${result.idea_id}`;
        await replyToCast(
          cast.hash,
          `Great find! 🚢 This idea has been added to The Shipyard.\n\n"${result.title}"\n\nView and fund it: ${ideaUrl}`
        );
      } else if (result.status === "duplicate") {
        const ideaUrl = `${APP_URL}/?idea=${result.idea_id}`;
        await replyToCast(
          cast.hash,
          `This idea is already on The Shipyard! Check it out and upvote or fund it: ${ideaUrl}`
        );
      } else if (result.status === "skipped") {
        const ideaUrl = `${APP_URL}/?idea=${result.idea_id}`;
        await replyToCast(
          cast.hash,
          `This idea is already on The Shipyard! Check it out: ${ideaUrl}`
        );
      } else if (result.status === "rejected") {
        await replyToCast(
          cast.hash,
          `Hmm, this doesn't look like an app idea I can add. ${result.reason || "Try tagging a cast that describes a mini app concept!"}`
        );
      }

      return NextResponse.json({
        status: "mention_processed",
        cast_hash: parentCast.hash,
        tagger: cast.author.username,
        ingest_result: result,
      });
    } catch (error) {
      console.error("[WEBHOOK] Error processing mention:", error);
      return NextResponse.json(
        { error: "Failed to process mention" },
        { status: 500 }
      );
    }
  }

  // Case 2: Top-level cast mentioning @theshipyard - treat the cast itself as an idea
  if (isDirectMention) {
    // Check if this is a share cast (sharing an existing idea)
    if (isShareCast(cast.text, cast.embeds)) {
      console.log("[WEBHOOK] Detected share cast in direct mention, sending thank you");
      await replyToCast(
        cast.hash,
        "Thanks for sharing this idea! 🚢 Your support helps great ideas get built."
      );
      return NextResponse.json({
        status: "skipped",
        reason: "Share cast - existing idea being shared",
      });
    }

    console.log("[WEBHOOK] Detected @theshipyard mention in top-level cast");

    // Forward this cast to ingest endpoint (the cast itself is the idea)
    try {
      const ingestResponse = await fetch(ingestUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(INGEST_SECRET && { "x-ingest-secret": INGEST_SECRET }),
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

      // Reply for skipped status only - ingest already replies for created/rejected/duplicate
      if (result.status === "skipped") {
        const ideaUrl = `${APP_URL}/?idea=${result.idea_id}`;
        await replyToCast(
          cast.hash,
          `This idea is already on The Shipyard! Check it out: ${ideaUrl}`
        );
      }

      return NextResponse.json({
        status: "direct_mention_processed",
        cast_hash: cast.hash,
        ingest_result: result,
      });
    } catch (error) {
      console.error("[WEBHOOK] Error processing direct mention:", error);
      return NextResponse.json(
        { error: "Failed to process direct mention" },
        { status: 500 }
      );
    }
  }

  // Case 3: Top-level cast in /someone-build channel (original behavior)
  if (!isFromTargetChannel) {
    return NextResponse.json({
      status: "skipped",
      reason: `Cast not from ${targetChannel} channel and not a mention`,
    });
  }

  // Skip replies in the channel - we only want top-level casts
  if (cast.parent_hash) {
    return NextResponse.json({
      status: "skipped",
      reason: "Skipping reply cast in channel",
    });
  }

  // Check if this is a share cast (sharing an existing idea) in the channel
  if (isShareCast(cast.text, cast.embeds)) {
    console.log("[WEBHOOK] Detected share cast in channel, sending thank you");
    await replyToCast(
      cast.hash,
      "Thanks for sharing this idea! 🚢 Your support helps great ideas get built."
    );
    return NextResponse.json({
      status: "skipped",
      reason: "Share cast - existing idea being shared",
    });
  }

  // Forward to the ingest endpoint
  try {
    const ingestResponse = await fetch(ingestUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(INGEST_SECRET && { "x-ingest-secret": INGEST_SECRET }),
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
