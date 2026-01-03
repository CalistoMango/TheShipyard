import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import type { DbIdea, DbUser, DbFunding, Idea, FundingEntry, WinningBuild, VotingBuild } from "~/lib/types";
import { parseId } from "~/lib/utils";
import { REFUND_DELAY_DAYS } from "~/lib/constants";
import { checkUserRefundEligibility, type FundingRecord } from "~/lib/refund";

interface IdeaDetailResponse {
  idea: Idea;
  fundingHistory: FundingEntry[];
  totalFunders: number;
  winningBuild: WinningBuild | null;
  votingBuilds: VotingBuild[]; // Builds currently in voting status
  userContribution?: number; // Total unrefunded contribution by requesting user
  refundDelayDays: number; // For UI to show correct message
  userRefundEligibility?: {
    eligible: boolean;
    daysUntilRefund: number;
    daysSinceLastFunding: number;
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsed = parseId(id, "idea ID");
    if (!parsed.valid) {
      return NextResponse.json(
        { data: null, error: parsed.error },
        { status: 400 }
      );
    }
    const ideaId = parsed.id;

    // Optional: get user's contribution if user_fid provided
    const url = new URL(request.url);
    const userFidParam = url.searchParams.get("user_fid");
    const userFid = userFidParam ? parseInt(userFidParam, 10) : null;

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

    // Fetch funding history with funder info (only non-refunded)
    const { data: fundingData, error: fundingError } = await supabase
      .from("funding")
      .select("*, users!funder_fid(username, display_name)")
      .eq("idea_id", ideaId)
      .is("refunded_at", null) // Only show non-refunded funding
      .order("created_at", { ascending: false })
      .limit(10);

    if (fundingError) {
      console.error("Error fetching funding:", fundingError);
    }

    // Count unique funders (only non-refunded)
    const { count: funderCount } = await supabase
      .from("funding")
      .select("funder_fid", { count: "exact", head: true })
      .eq("idea_id", ideaId)
      .is("refunded_at", null);

    // V2: Refund availability is per-user, not per-idea
    // Show that refunds are possible if idea is open (actual eligibility checked per-user)
    const refundAvailable = row.status === "open";

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
      refund_available: refundAvailable,
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
        // Supabase single-row joins return objects, not arrays
        const build = buildData as unknown as { id: string; url: string; builder_fid: number; users: { username: string | null; display_name: string | null } | null };
        winningBuild = {
          id: build.id,
          url: build.url,
          builder: build.users?.display_name || build.users?.username || "Anonymous",
          builder_fid: build.builder_fid,
        };
      }
    }

    // Fetch builds in voting status
    const { data: votingBuildsData } = await supabase
      .from("builds")
      .select("id, url, description, builder_fid, votes_approve, votes_reject, vote_ends_at, users!builder_fid(username, display_name, pfp_url)")
      .eq("idea_id", ideaId)
      .eq("status", "voting");

    // If user_fid provided, get their votes on these builds
    let userVotesMap: Record<string, boolean> = {};
    if (userFid && votingBuildsData && votingBuildsData.length > 0) {
      const buildIds = votingBuildsData.map(b => b.id);
      const { data: userVotes } = await supabase
        .from("votes")
        .select("build_id, approved")
        .eq("voter_fid", userFid)
        .in("build_id", buildIds);

      if (userVotes) {
        userVotesMap = Object.fromEntries(userVotes.map(v => [v.build_id, v.approved]));
      }
    }

    // Transform voting builds
    const now = Date.now();
    const votingBuilds: VotingBuild[] = (votingBuildsData || []).map((b) => {
      const buildRow = b as unknown as {
        id: string;
        url: string;
        description: string | null;
        builder_fid: number;
        votes_approve: number;
        votes_reject: number;
        vote_ends_at: string | null;
        users: { username: string | null; display_name: string | null; pfp_url: string | null } | null;
      };
      const voteEndsAt = buildRow.vote_ends_at ? new Date(buildRow.vote_ends_at).getTime() : now;
      const secondsRemaining = Math.max(0, Math.floor((voteEndsAt - now) / 1000));
      const votingEnded = voteEndsAt < now;
      const userVote = userVotesMap[buildRow.id];

      return {
        id: buildRow.id,
        url: buildRow.url,
        description: buildRow.description,
        builder: buildRow.users?.display_name || buildRow.users?.username || "Anonymous",
        builder_fid: buildRow.builder_fid,
        builder_pfp: buildRow.users?.pfp_url || null,
        votes_approve: buildRow.votes_approve,
        votes_reject: buildRow.votes_reject,
        vote_ends_at: buildRow.vote_ends_at || new Date().toISOString(),
        vote_ends_in_seconds: secondsRemaining,
        voting_ended: votingEnded,
        user_vote: userVote === undefined ? null : (userVote ? "approve" : "reject"),
      };
    });

    // Transform funding history
    const fundingHistory: FundingEntry[] = (fundingData || []).map(
      (f: DbFunding & { users: DbUser | null }) => ({
        user: f.users?.display_name || f.users?.username || "Anonymous",
        user_fid: f.funder_fid,
        amount: Number(f.amount),
        created_at: f.created_at,
      })
    );

    // If user_fid provided, get their funding records for contribution and eligibility
    let userContribution: number | undefined;
    let userRefundEligibility: IdeaDetailResponse["userRefundEligibility"];
    if (userFid && !isNaN(userFid)) {
      // Fetch all user funding (including refunded) for eligibility calculation
      const { data: userFundingData } = await supabase
        .from("funding")
        .select("id, amount, created_at, refunded_at")
        .eq("idea_id", ideaId)
        .eq("funder_fid", userFid);

      // Calculate total unrefunded contribution
      userContribution = userFundingData
        ?.filter(f => !f.refunded_at)
        .reduce((sum, f) => sum + Number(f.amount), 0) || 0;

      // Calculate refund eligibility
      if (userFundingData && userFundingData.length > 0) {
        const fundingRecords: FundingRecord[] = userFundingData.map(f => ({
          id: f.id,
          amount: Number(f.amount),
          created_at: f.created_at,
          refunded_at: f.refunded_at,
        }));
        const eligibility = checkUserRefundEligibility(row.status, fundingRecords);
        userRefundEligibility = {
          eligible: eligibility.eligible,
          daysUntilRefund: eligibility.daysUntilRefund,
          daysSinceLastFunding: eligibility.daysSinceLastFunding,
        };
      }
    }

    const response: IdeaDetailResponse = {
      idea,
      fundingHistory,
      totalFunders: funderCount || 0,
      winningBuild,
      votingBuilds,
      userContribution,
      refundDelayDays: REFUND_DELAY_DAYS,
      userRefundEligibility,
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
