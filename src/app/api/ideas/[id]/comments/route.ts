import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import type { Comment } from "~/lib/types";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const NEYNAR_API_URL = "https://api.neynar.com/v2";

interface NeynarCast {
  hash: string;
  author: {
    fid: number;
    username: string;
    display_name: string;
  };
  text: string;
  timestamp: string;
}

// The Shipyard's FID - filter out automated replies from this account
const SHIPYARD_FID = 2005449;

// GET /api/ideas/[id]/comments - Fetch Farcaster replies for an idea
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ideaId = parseInt(id, 10);

  if (isNaN(ideaId)) {
    return NextResponse.json({ error: "Invalid idea ID" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();

    // Get the idea's cast_hash
    const { data: idea, error: ideaError } = await supabase
      .from("ideas")
      .select("cast_hash")
      .eq("id", ideaId)
      .single();

    if (ideaError || !idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    if (!idea.cast_hash) {
      // No cast associated, return empty comments
      return NextResponse.json({
        data: [],
        cast_url: null,
      });
    }

    const castUrl = `https://warpcast.com/~/conversations/${idea.cast_hash}`;

    // If no Neynar API key, return empty with cast URL
    if (!NEYNAR_API_KEY) {
      return NextResponse.json({
        data: [],
        cast_url: castUrl,
        message: "Comments available on Farcaster",
      });
    }

    // Check if this is a full hash (40+ chars) or short hash (8-10 chars)
    // Neynar API only works with full hashes
    const isFullHash = idea.cast_hash.length > 20;

    if (!isFullHash) {
      // Short hash from imported data - can't fetch comments via Neynar
      return NextResponse.json({
        data: [],
        cast_url: castUrl,
        message: "View discussion on Farcaster",
      });
    }

    // Fetch replies from Neynar using full hash
    const response = await fetch(
      `${NEYNAR_API_URL}/farcaster/cast/conversation?identifier=${idea.cast_hash}&type=hash&reply_depth=1&include_chronological_parent_casts=false`,
      {
        headers: {
          accept: "application/json",
          api_key: NEYNAR_API_KEY,
        },
      }
    );

    if (!response.ok) {
      console.error("Neynar API error:", response.status, await response.text());
      return NextResponse.json({
        data: [],
        cast_url: `https://warpcast.com/~/conversations/${idea.cast_hash}`,
        message: "Unable to load comments",
      });
    }

    const neynarData = await response.json();

    // Handle different response structures
    const originalCast = neynarData.conversation?.cast;
    const allReplies = originalCast?.direct_replies ||
                    neynarData.direct_replies ||
                    [];

    // Filter out The Shipyard's automated replies
    const replies = allReplies.filter(
      (reply: NeynarCast) => reply.author?.fid !== SHIPYARD_FID
    );

    // Transform to Comment type
    const comments: Comment[] = replies.map((reply: NeynarCast) => ({
      user: reply.author?.display_name || reply.author?.username || "Unknown",
      text: reply.text,
      time: formatTimeAgo(new Date(reply.timestamp)),
    }));

    // Extract original cast info
    const original = originalCast ? {
      text: originalCast.text,
      author: originalCast.author?.display_name || originalCast.author?.username || "Unknown",
      author_pfp: originalCast.author?.pfp_url || null,
      timestamp: originalCast.timestamp,
    } : null;

    return NextResponse.json({
      data: comments,
      original_cast: original,
      cast_url: `https://warpcast.com/~/conversations/${idea.cast_hash}`,
    });
  } catch (error) {
    console.error("Comments fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
