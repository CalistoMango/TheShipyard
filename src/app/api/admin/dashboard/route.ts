import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { validateAuth, isAdminFid } from "~/lib/auth";

// GET /api/admin/dashboard - Get admin dashboard data (JWT-based auth)
export async function GET(request: NextRequest) {
  // Validate admin authentication via JWT
  const auth = await validateAuth(request);
  if (!auth.authenticated || !auth.fid) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
  }
  if (!isAdminFid(auth.fid)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const supabase = createServerClient();

    // Get pending builds
    const { data: pendingBuilds } = await supabase
      .from("builds")
      .select(`
        id,
        idea_id,
        builder_fid,
        url,
        description,
        created_at,
        ideas!idea_id(title),
        users!builder_fid(username, display_name)
      `)
      .eq("status", "pending_review")
      .order("created_at", { ascending: false });

    // Get pending reports
    const { data: pendingReports } = await supabase
      .from("reports")
      .select(`
        id,
        idea_id,
        reporter_fid,
        url,
        note,
        created_at,
        ideas!idea_id(title),
        users!reporter_fid(username, display_name)
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    // Get stats
    const { count: totalIdeas } = await supabase
      .from("ideas")
      .select("id", { count: "exact", head: true });

    const { data: poolData } = await supabase
      .from("ideas")
      .select("pool")
      .neq("status", "completed");

    const totalPool = poolData?.reduce((sum, i) => sum + (Number(i.pool) || 0), 0) || 0;

    const { count: votingCount } = await supabase
      .from("ideas")
      .select("id", { count: "exact", head: true })
      .eq("status", "voting");

    // Transform data
    const builds = (pendingBuilds || []).map((b) => {
      const idea = (b.ideas as unknown as { title: string }[] | null)?.[0];
      const user = (b.users as unknown as { username: string | null; display_name: string | null }[] | null)?.[0];
      return {
        id: b.id,
        idea_id: b.idea_id,
        idea_title: idea?.title || "Unknown",
        builder_fid: b.builder_fid,
        builder_name: user?.display_name || user?.username || `fid:${b.builder_fid}`,
        url: b.url,
        description: b.description,
        created_at: b.created_at,
      };
    });

    const reports = (pendingReports || []).map((r) => {
      const idea = (r.ideas as unknown as { title: string }[] | null)?.[0];
      const user = (r.users as unknown as { username: string | null; display_name: string | null }[] | null)?.[0];
      return {
        id: r.id,
        idea_id: r.idea_id,
        idea_title: idea?.title || "Unknown",
        reporter_fid: r.reporter_fid,
        reporter_name: user?.display_name || user?.username || `fid:${r.reporter_fid}`,
        url: r.url,
        note: r.note,
        created_at: r.created_at,
      };
    });

    return NextResponse.json({
      data: {
        pending_builds: builds,
        pending_reports: reports,
        stats: {
          total_ideas: totalIdeas || 0,
          total_pool: totalPool,
          ideas_in_voting: votingCount || 0,
        },
      },
    });
  } catch (err) {
    console.error("Admin dashboard error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
