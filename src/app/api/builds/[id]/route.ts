import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";

// GET /api/builds/[id] - Get build details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = createServerClient();

    const { data: build, error } = await supabase
      .from("builds")
      .select(
        `
        id,
        idea_id,
        builder_fid,
        url,
        description,
        status,
        vote_ends_at,
        votes_approve,
        votes_reject,
        created_at,
        updated_at,
        users:builder_fid (
          username,
          display_name,
          pfp_url,
          streak
        ),
        ideas:idea_id (
          title,
          description,
          pool,
          category
        )
      `
      )
      .eq("id", id)
      .single();

    if (error || !build) {
      return NextResponse.json({ error: "Build not found" }, { status: 404 });
    }

    const user = (build.users as unknown as {
      username: string | null;
      display_name: string | null;
      pfp_url: string | null;
      streak: number;
    }[] | null)?.[0] ?? null;
    const idea = (build.ideas as unknown as {
      title: string;
      description: string;
      pool: number;
      category: string;
    }[] | null)?.[0] ?? null;

    // Calculate voting progress
    const totalVotes = build.votes_approve + build.votes_reject;
    const approvalPercentage =
      totalVotes > 0 ? Math.round((build.votes_approve / totalVotes) * 100) : 0;

    // Calculate time remaining if in voting
    let timeRemaining = null;
    if (build.status === "voting" && build.vote_ends_at) {
      const endsAt = new Date(build.vote_ends_at).getTime();
      const now = Date.now();
      if (endsAt > now) {
        const hoursLeft = Math.ceil((endsAt - now) / (60 * 60 * 1000));
        timeRemaining = `${hoursLeft}h`;
      } else {
        timeRemaining = "Voting ended";
      }
    }

    return NextResponse.json({
      data: {
        id: build.id,
        idea_id: build.idea_id,
        idea: idea
          ? {
              title: idea.title,
              description: idea.description,
              pool: Number(idea.pool),
              category: idea.category,
            }
          : null,
        builder: {
          fid: build.builder_fid,
          name: user?.display_name || user?.username || `fid:${build.builder_fid}`,
          pfp_url: user?.pfp_url || null,
          streak: user?.streak || 0,
        },
        url: build.url,
        description: build.description,
        status: build.status,
        voting: {
          ends_at: build.vote_ends_at,
          time_remaining: timeRemaining,
          votes_approve: build.votes_approve,
          votes_reject: build.votes_reject,
          total_votes: totalVotes,
          approval_percentage: approvalPercentage,
        },
        created_at: build.created_at,
        updated_at: build.updated_at,
      },
    });
  } catch (error) {
    console.error("Get build error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
