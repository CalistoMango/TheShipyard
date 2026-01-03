import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import type { DbIdea, DbUser, Idea, Category, IdeaStatus } from "~/lib/types";

type SortMode = "trending" | "funded" | "upvoted" | "newest";

interface IdeasQueryParams {
  category?: Category | "all";
  status?: IdeaStatus;
  sort?: SortMode;
  page?: number;
  pageSize?: number;
}

function parseQueryParams(request: NextRequest): IdeasQueryParams {
  const { searchParams } = new URL(request.url);

  return {
    category: (searchParams.get("category") as Category | "all") || "all",
    status: searchParams.get("status") as IdeaStatus | undefined,
    sort: (searchParams.get("sort") as SortMode) || "newest",
    page: parseInt(searchParams.get("page") || "1", 10),
    pageSize: Math.min(parseInt(searchParams.get("pageSize") || "20", 10), 100),
  };
}

export async function GET(request: NextRequest) {
  try {
    const params = parseQueryParams(request);
    const supabase = createServerClient();

    // Build query
    let query = supabase
      .from("ideas")
      .select("*, users!submitter_fid(username, display_name, pfp_url)", { count: "exact" });

    // Filter by category
    if (params.category && params.category !== "all") {
      query = query.eq("category", params.category);
    }

    // Filter by status
    if (params.status) {
      query = query.eq("status", params.status);
    }

    // Sort
    switch (params.sort) {
      case "funded":
        query = query.order("pool", { ascending: false }).order("created_at", { ascending: false });
        break;
      case "upvoted":
        query = query.order("upvote_count", { ascending: false }).order("created_at", { ascending: false });
        break;
      case "trending":
        // Trending: prioritize ideas with engagement, then by recency
        // Ideas with upvotes or funding come first, sorted by combined score
        // Then remaining ideas sorted by newest
        query = query
          .order("upvote_count", { ascending: false })
          .order("pool", { ascending: false })
          .order("created_at", { ascending: false });
        break;
      case "newest":
      default:
        query = query.order("created_at", { ascending: false });
        break;
    }

    // Pagination
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error("Error fetching ideas:", error);
      return NextResponse.json(
        { data: null, error: error.message },
        { status: 500 }
      );
    }

    // Get idea IDs that have builds in voting status
    const ideaIds = (data || []).map((row: DbIdea) => row.id);
    let votingBuildIdeaIds = new Set<number>();
    if (ideaIds.length > 0) {
      const { data: votingBuilds } = await supabase
        .from("builds")
        .select("idea_id")
        .eq("status", "voting")
        .in("idea_id", ideaIds);

      if (votingBuilds) {
        votingBuildIdeaIds = new Set(votingBuilds.map(b => b.idea_id));
      }
    }

    // Transform to frontend type
    const ideas: Idea[] = (data || []).map((row: DbIdea & { users: DbUser | null }) => ({
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
      hasVotingBuilds: votingBuildIdeaIds.has(row.id),
      created_at: row.created_at,
    }));

    return NextResponse.json({
      data: ideas,
      total: count || 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { data: null, error: "Internal server error" },
      { status: 500 }
    );
  }
}
