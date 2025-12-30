import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import type { Comment } from "~/lib/types";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const NEYNAR_API_URL = "https://api.neynar.com/v2";

interface NeynarCast {
  hash: string;
  author: {
    username: string;
    display_name: string;
  };
  text: string;
  timestamp: string;
}

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

    // If no Neynar API key, return empty with cast URL
    if (!NEYNAR_API_KEY) {
      return NextResponse.json({
        data: [],
        cast_url: `https://warpcast.com/~/conversations/${idea.cast_hash}`,
        message: "Comments available on Farcaster",
      });
    }

    // Construct full Warpcast URL from short hash for API lookup
    const castUrl = `https://warpcast.com/~/conversations/${idea.cast_hash}`;

    // Fetch replies from Neynar using URL-based lookup
    const response = await fetch(
      `${NEYNAR_API_URL}/farcaster/cast/conversation?identifier=${encodeURIComponent(castUrl)}&type=url&reply_depth=1&include_chronological_parent_casts=false`,
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
    const replies = neynarData.conversation?.cast?.direct_replies ||
                    neynarData.direct_replies ||
                    [];

    // Transform to Comment type
    const comments: Comment[] = replies.map((reply: NeynarCast) => ({
      user: reply.author?.display_name || reply.author?.username || "Unknown",
      text: reply.text,
      time: formatTimeAgo(new Date(reply.timestamp)),
    }));

    return NextResponse.json({
      data: comments,
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
