import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import type { DbIdea, DbUser, DbFunding, Idea, FundingEntry, WinningBuild } from "~/lib/types";

interface IdeaDetailResponse {
  idea: Idea;
  fundingHistory: FundingEntry[];
  totalFunders: number;
  winningBuild: WinningBuild | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ideaId = parseInt(id, 10);

    if (isNaN(ideaId)) {
      return NextResponse.json(
        { data: null, error: "Invalid idea ID" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Fetch idea with submitter info
    const { data: ideaData, error: ideaError } = await supabase
      .from("ideas")
      .select("*, users!submitter_fid(username, display_name, pfp_url)")
      .eq("id", ideaId)
      .single();

    if (ideaError) {
      if (ideaError.code === "PGRST116") {
        return NextResponse.json(
          { data: null, error: "Idea not found" },
          { status: 404 }
        );
      }
      console.error("Error fetching idea:", ideaError);
      return NextResponse.json(
        { data: null, error: ideaError.message },
        { status: 500 }
      );
    }

    const row = ideaData as DbIdea & { users: DbUser | null };

    // Fetch funding history with funder info
    const { data: fundingData, error: fundingError } = await supabase
      .from("funding")
      .select("*, users!funder_fid(username, display_name)")
      .eq("idea_id", ideaId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (fundingError) {
      console.error("Error fetching funding:", fundingError);
    }

    // Count unique funders
    const { count: funderCount } = await supabase
      .from("funding")
      .select("funder_fid", { count: "exact", head: true })
      .eq("idea_id", ideaId);

    // Transform idea
    const idea: Idea = {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      pool: Number(row.pool),
      upvotes: row.upvote_count,
      submitter: row.users?.display_name || row.users?.username || "Anonymous",
      submitter_username: row.users?.username || null,
      submitter_fid: row.submitter_fid,
      submitter_pfp: row.users?.pfp_url || null,
      status: row.status,
      cast_hash: row.cast_hash,
      related_casts: row.related_casts || [],
      solution_url: row.solution_url,
      created_at: row.created_at,
    };

    // Fetch winning build if idea is completed (via build/vote flow)
    let winningBuild: WinningBuild | null = null;
    if (row.status === "completed") {
      const { data: buildData } = await supabase
        .from("builds")
        .select("id, url, builder_fid, users!builder_fid(username, display_name)")
        .eq("idea_id", ideaId)
        .eq("status", "approved")
        .limit(1)
        .single();

      if (buildData) {
        const build = buildData as unknown as { id: string; url: string; builder_fid: number; users: { username: string | null; display_name: string | null }[] | null };
        const builderUser = build.users?.[0] ?? null;
        winningBuild = {
          id: build.id,
          url: build.url,
          builder: builderUser?.display_name || builderUser?.username || "Anonymous",
          builder_fid: build.builder_fid,
        };
      }
    }

    // Transform funding history
    const fundingHistory: FundingEntry[] = (fundingData || []).map(
      (f: DbFunding & { users: DbUser | null }) => ({
        user: f.users?.display_name || f.users?.username || "Anonymous",
        user_fid: f.funder_fid,
        amount: Number(f.amount),
        created_at: f.created_at,
      })
    );

    const response: IdeaDetailResponse = {
      idea,
      fundingHistory,
      totalFunders: funderCount || 0,
      winningBuild,
    };

    return NextResponse.json({ data: response, error: null });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { data: null, error: "Internal server error" },
      { status: 500 }
    );
  }
}
