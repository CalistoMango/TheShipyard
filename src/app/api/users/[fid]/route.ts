import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";

// GET /api/users/[fid] - Get user profile and stats
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fid: string }> }
) {
  const { fid } = await params;
  const userFid = parseInt(fid, 10);

  if (isNaN(userFid)) {
    return NextResponse.json({ error: "Invalid FID" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();

    // Get user info
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("fid", userFid)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get ideas submitted by user
    const { data: ideas } = await supabase
      .from("ideas")
      .select("id, title, category, status, pool, upvote_count, created_at")
      .eq("submitter_fid", userFid)
      .order("created_at", { ascending: false })
      .limit(10);

    // Get builds by user
    const { data: builds } = await supabase
      .from("builds")
      .select(
        `
        id,
        idea_id,
        status,
        created_at,
        ideas:idea_id (
          title,
          pool
        )
      `
      )
      .eq("builder_fid", userFid)
      .order("created_at", { ascending: false })
      .limit(10);

    // Get funding by user
    const { data: funding } = await supabase
      .from("funding")
      .select(
        `
        amount,
        created_at,
        ideas:idea_id (
          id,
          title
        )
      `
      )
      .eq("funder_fid", userFid)
      .order("created_at", { ascending: false })
      .limit(10);

    // Get payouts received
    const { data: payouts } = await supabase
      .from("payouts")
      .select("amount, payout_type, created_at")
      .eq("recipient_fid", userFid)
      .order("created_at", { ascending: false })
      .limit(10);

    // Calculate stats
    const totalEarnings = payouts?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
    const totalFunded = funding?.reduce((sum, f) => sum + Number(f.amount), 0) || 0;
    const approvedBuilds = builds?.filter((b) => b.status === "approved").length || 0;

    return NextResponse.json({
      data: {
        user: {
          fid: user.fid,
          username: user.username,
          display_name: user.display_name,
          pfp_url: user.pfp_url,
          balance: Number(user.balance),
          streak: user.streak,
          created_at: user.created_at,
        },
        stats: {
          ideas_submitted: ideas?.length || 0,
          total_funded: totalFunded,
          total_earnings: totalEarnings,
          approved_builds: approvedBuilds,
          current_streak: user.streak,
        },
        recent_ideas: ideas?.map((i) => ({
          id: i.id,
          title: i.title,
          category: i.category,
          status: i.status,
          pool: Number(i.pool),
          upvotes: i.upvote_count,
        })) || [],
        recent_builds: builds?.map((b) => {
          const idea = (b.ideas as unknown as { title: string; pool: number }[] | null)?.[0] ?? null;
          return {
            id: b.id,
            idea_id: b.idea_id,
            idea_title: idea?.title || "Unknown",
            idea_pool: idea ? Number(idea.pool) : 0,
            status: b.status,
            created_at: b.created_at,
          };
        }) || [],
        recent_funding: funding?.map((f) => {
          const idea = (f.ideas as unknown as { id: number; title: string }[] | null)?.[0] ?? null;
          return {
            idea_id: idea?.id,
            idea_title: idea?.title || "Unknown",
            amount: Number(f.amount),
            created_at: f.created_at,
          };
        }) || [],
        recent_payouts: payouts?.map((p) => ({
          amount: Number(p.amount),
          type: p.payout_type,
          created_at: p.created_at,
        })) || [],
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
