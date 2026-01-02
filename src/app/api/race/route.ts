import { NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";

// Race mode threshold (configurable via env)
const RACE_MODE_THRESHOLD = Number(process.env.RACE_MODE_THRESHOLD) || 100;

// GET /api/race - Get all ideas currently in race mode
export async function GET() {
  try {
    const supabase = createServerClient();

    // Get ideas in voting status (race mode)
    const { data: racingIdeas, error } = await supabase
      .from("ideas")
      .select(
        `
        id,
        title,
        description,
        category,
        status,
        pool,
        upvote_count,
        cast_hash,
        created_at,
        submitter_fid,
        users:submitter_fid (
          username,
          display_name
        )
      `
      )
      .eq("status", "voting")
      .order("pool", { ascending: false });

    if (error) {
      console.error("Error fetching racing ideas:", error);
      return NextResponse.json(
        { error: "Failed to fetch racing ideas" },
        { status: 500 }
      );
    }

    // Transform to API format
    // NOTE: Supabase single-row joins return objects, not arrays
    const ideas = racingIdeas.map((idea) => {
      const user = idea.users as unknown as { username: string | null; display_name: string | null } | null;
      return {
        id: idea.id,
        title: idea.title,
        description: idea.description,
        category: idea.category,
        status: idea.status,
        pool: Number(idea.pool),
        upvotes: idea.upvote_count,
        submitter: user?.display_name || user?.username || `fid:${idea.submitter_fid}`,
        submitter_fid: idea.submitter_fid,
        cast_hash: idea.cast_hash,
        created_at: idea.created_at,
      };
    });

    return NextResponse.json({
      data: ideas,
      count: ideas.length,
      threshold: RACE_MODE_THRESHOLD,
    });
  } catch (error) {
    console.error("Race API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
