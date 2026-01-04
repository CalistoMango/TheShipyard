import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { validateAuth } from "~/lib/auth";
import { checkUserRefundEligibility, FundingRecord } from "~/lib/refund";
import { parseId } from "~/lib/utils";

/**
 * GET /api/users/[fid] - Get user profile and stats
 *
 * Public profile data is visible to all. Private data (balance, payouts,
 * funding details) is only visible to the profile owner.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fid: string }> }
) {
  const { fid } = await params;
  const parsed = parseId(fid, "FID");
  if (!parsed.valid) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const userFid = parsed.id;

  // Check if requester is viewing their own profile
  const auth = await validateAuth(request);
  const isOwnProfile = auth.authenticated && auth.fid === userFid;

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

    // Get idea IDs that have builds in voting status
    const ideaIds = ideas?.map((i) => i.id) || [];
    const { data: votingBuildsForIdeas } = ideaIds.length > 0
      ? await supabase
          .from("builds")
          .select("idea_id")
          .in("idea_id", ideaIds)
          .eq("status", "voting")
      : { data: [] };

    const ideasWithVotingBuilds = new Set(votingBuildsForIdeas?.map((b) => b.idea_id) || []);

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

    // Get ALL funding by user (including refunded) for lifetime total
    const { data: allFunding } = await supabase
      .from("funding")
      .select(
        `
        id,
        amount,
        created_at,
        refunded_at,
        idea_id,
        ideas:idea_id (
          id,
          title,
          status
        )
      `
      )
      .eq("funder_fid", userFid)
      .order("created_at", { ascending: false });

    // Filter to unrefunded funding for eligibility calculations
    const funding = allFunding?.filter((f) => !f.refunded_at) || [];

    // Get payouts received
    const { data: payouts } = await supabase
      .from("payouts")
      .select("amount, payout_type, created_at")
      .eq("recipient_fid", userFid)
      .order("created_at", { ascending: false })
      .limit(10);

    // Get builds in voting status that user can vote on (not their own)
    const { data: votingBuilds } = await supabase
      .from("builds")
      .select(`
        id,
        idea_id,
        builder_fid,
        ideas:idea_id (title, pool)
      `)
      .eq("status", "voting")
      .neq("builder_fid", userFid);

    // Get builds user already voted on
    const { data: userVotes } = await supabase
      .from("build_votes")
      .select("build_id")
      .eq("voter_fid", userFid);

    const votedBuildIds = new Set(userVotes?.map((v) => v.build_id) || []);
    const pendingVoteBuilds = votingBuilds?.filter((b) => !votedBuildIds.has(b.id)) || [];

    // Calculate stats
    const totalEarnings = payouts?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
    // total_funded is ALL historical funding EXCEPT refunded amounts
    // (includes funding for completed ideas, just not refunded ones)
    const totalFunded = funding.reduce((sum, f) => sum + Number(f.amount), 0);
    const approvedBuilds = builds?.filter((b) => b.status === "approved").length || 0;

    // Build response - redact private data if not own profile
    const response: Record<string, unknown> = {
      user: {
        fid: user.fid,
        username: user.username,
        display_name: user.display_name,
        pfp_url: user.pfp_url,
        streak: user.streak,
        created_at: user.created_at,
        // Balance only visible to profile owner
        ...(isOwnProfile && { balance: Number(user.balance) }),
      },
      stats: {
        ideas_submitted: ideas?.length || 0,
        approved_builds: approvedBuilds,
        total_builds: builds?.length || 0,
        current_streak: user.streak,
        // Financial stats only visible to profile owner
        ...(isOwnProfile && {
          total_funded: totalFunded,
          total_earnings: totalEarnings,
        }),
      },
      // Public: ideas and builds are visible to all
      recent_ideas: ideas?.map((i) => ({
        id: i.id,
        title: i.title,
        category: i.category,
        status: i.status,
        pool: Number(i.pool),
        upvotes: i.upvote_count,
        hasVotingBuilds: ideasWithVotingBuilds.has(i.id),
      })) || [],
      recent_builds: builds?.map((b) => {
        // Supabase returns single-row joins as objects, not arrays
        const idea = b.ideas as unknown as { title: string; pool: number } | null;
        return {
          id: b.id,
          idea_id: b.idea_id,
          idea_title: idea?.title || "Unknown",
          idea_pool: idea ? Number(idea.pool) : 0,
          status: b.status,
          created_at: b.created_at,
        };
      }) || [],
      // Pending votes: builds user can vote on (visible to profile owner only)
      ...(isOwnProfile && {
        pending_votes: pendingVoteBuilds.map((b) => {
          const idea = b.ideas as unknown as { title: string; pool: number } | null;
          return {
            id: b.id,
            idea_id: b.idea_id,
            idea_title: idea?.title || "Unknown",
            idea_pool: idea ? Number(idea.pool) : 0,
          };
        }),
      }),
    };

    // Private: funding and payout details only visible to profile owner
    if (isOwnProfile) {
      // V2: Group funding by idea to calculate per-user eligibility
      // Each idea shows total funded amount and eligibility based on user's LATEST funding
      const fundingByIdea = new Map<number, {
        idea_id: number;
        idea_title: string;
        idea_status: string;
        total_amount: number;
        funding_records: FundingRecord[];
        latest_created_at: string;
      }>();

      for (const f of funding || []) {
        const idea = f.ideas as unknown as {
          id: number;
          title: string;
          status: string;
        } | null;

        if (!idea) continue;

        const existing = fundingByIdea.get(idea.id);
        const fundingRecord: FundingRecord = {
          id: f.id,
          amount: Number(f.amount),
          created_at: f.created_at,
          refunded_at: f.refunded_at,
        };

        if (existing) {
          existing.total_amount += Number(f.amount);
          existing.funding_records.push(fundingRecord);
          // Track latest funding date
          if (f.created_at > existing.latest_created_at) {
            existing.latest_created_at = f.created_at;
          }
        } else {
          fundingByIdea.set(idea.id, {
            idea_id: idea.id,
            idea_title: idea.title,
            idea_status: idea.status,
            total_amount: Number(f.amount),
            funding_records: [fundingRecord],
            latest_created_at: f.created_at,
          });
        }
      }

      // Convert to array and calculate eligibility for each idea
      response.recent_funding = Array.from(fundingByIdea.values()).map((ideaFunding) => {
        // V2: Calculate per-user eligibility based on their LATEST funding for this idea
        const refundInfo = checkUserRefundEligibility(
          ideaFunding.idea_status,
          ideaFunding.funding_records
        );

        return {
          idea_id: ideaFunding.idea_id,
          idea_title: ideaFunding.idea_title,
          idea_status: ideaFunding.idea_status,
          amount: ideaFunding.total_amount,
          created_at: ideaFunding.latest_created_at, // Show latest funding date
          refund_eligible: refundInfo.eligible,
          days_until_refund: refundInfo.daysUntilRefund,
        };
      }).slice(0, 10); // Limit to 10 ideas

      response.recent_payouts = payouts?.map((p) => ({
        amount: Number(p.amount),
        type: p.payout_type,
        created_at: p.created_at,
      })) || [];
    }

    return NextResponse.json({ data: response });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
