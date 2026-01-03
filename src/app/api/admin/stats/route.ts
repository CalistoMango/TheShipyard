import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { verifyAdminAuth } from "~/lib/admin";

// GET /api/admin/stats - Get platform statistics (admin only)
export async function GET(request: NextRequest) {
  if (!verifyAdminAuth(request)) {
    return NextResponse.json(
      { error: "Unauthorized - admin access required" },
      { status: 401 }
    );
  }

  try {
    const supabase = createServerClient();

    // Get counts
    const [users, ideas, builds, funding, payouts] = await Promise.all([
      supabase.from("users").select("*", { count: "exact", head: true }),
      supabase.from("ideas").select("*", { count: "exact", head: true }),
      supabase.from("builds").select("*", { count: "exact", head: true }),
      supabase.from("funding").select("amount"),
      supabase.from("payouts").select("amount"),
    ]);

    // Ideas by status
    const [openIdeas, votingIdeas, completedIdeas, alreadyExistsIdeas] = await Promise.all([
      supabase
        .from("ideas")
        .select("*", { count: "exact", head: true })
        .eq("status", "open"),
      supabase
        .from("ideas")
        .select("*", { count: "exact", head: true })
        .eq("status", "voting"),
      supabase
        .from("ideas")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed"),
      supabase
        .from("ideas")
        .select("*", { count: "exact", head: true })
        .eq("status", "already_exists"),
    ]);

    // Builds by status
    const [pendingBuilds, votingBuilds, approvedBuilds, rejectedBuilds] =
      await Promise.all([
        supabase
          .from("builds")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending_review"),
        supabase
          .from("builds")
          .select("*", { count: "exact", head: true })
          .eq("status", "voting"),
        supabase
          .from("builds")
          .select("*", { count: "exact", head: true })
          .eq("status", "approved"),
        supabase
          .from("builds")
          .select("*", { count: "exact", head: true })
          .eq("status", "rejected"),
      ]);

    // Calculate totals
    const totalFunding =
      funding.data?.reduce((sum, f) => sum + Number(f.amount), 0) || 0;
    const totalPayouts =
      payouts.data?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

    // Get current pool total
    const { data: poolData } = await supabase.from("ideas").select("pool");
    const totalInPools =
      poolData?.reduce((sum, i) => sum + Number(i.pool), 0) || 0;

    return NextResponse.json({
      data: {
        users: {
          total: users.count || 0,
        },
        ideas: {
          total: ideas.count || 0,
          open: openIdeas.count || 0,
          voting: votingIdeas.count || 0,
          completed: completedIdeas.count || 0,
          already_exists: alreadyExistsIdeas.count || 0,
        },
        builds: {
          total: builds.count || 0,
          pending_review: pendingBuilds.count || 0,
          voting: votingBuilds.count || 0,
          approved: approvedBuilds.count || 0,
          rejected: rejectedBuilds.count || 0,
        },
        financials: {
          total_funding: totalFunding,
          total_payouts: totalPayouts,
          current_pools: totalInPools,
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
