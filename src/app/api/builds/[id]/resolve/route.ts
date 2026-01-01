import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { BUILDER_FEE_PERCENT, SUBMITTER_FEE_PERCENT, PLATFORM_FEE_PERCENT } from "~/lib/constants";
import { validateAuth, isAdminFid } from "~/lib/auth";

// Payout split from constants (as decimals for calculation)
const PAYOUT_SPLIT = {
  builder: BUILDER_FEE_PERCENT / 100,
  submitter: SUBMITTER_FEE_PERCENT / 100,
  platform: PLATFORM_FEE_PERCENT / 100,
};

// Platform FID (for platform share) - should be configured
const PLATFORM_FID = Number(process.env.PLATFORM_FID) || 1;

// POST /api/builds/[id]/resolve - Resolve voting and process payouts
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: buildId } = await params;

  try {
    // Validate admin authentication
    const auth = await validateAuth(request);
    if (!auth.authenticated || !auth.fid) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
    }
    if (!isAdminFid(auth.fid)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const supabase = createServerClient();

    // Get build with idea info
    const { data: build, error: buildError } = await supabase
      .from("builds")
      .select(
        `
        id,
        status,
        vote_ends_at,
        votes_approve,
        votes_reject,
        builder_fid,
        idea_id,
        ideas:idea_id (
          pool,
          submitter_fid
        )
      `
      )
      .eq("id", buildId)
      .single();

    if (buildError || !build) {
      return NextResponse.json({ error: "Build not found" }, { status: 404 });
    }

    if (build.status !== "voting") {
      return NextResponse.json(
        { error: `Build is not in voting status. Current: ${build.status}` },
        { status: 400 }
      );
    }

    // Check if voting has ended
    if (build.vote_ends_at) {
      const endsAt = new Date(build.vote_ends_at).getTime();
      if (Date.now() < endsAt) {
        const hoursLeft = Math.ceil((endsAt - Date.now()) / (60 * 60 * 1000));
        return NextResponse.json(
          { error: `Voting still active. ${hoursLeft}h remaining.` },
          { status: 400 }
        );
      }
    }

    const idea = (build.ideas as unknown as { pool: number; submitter_fid: number | null }[] | null)?.[0] ?? null;
    const pool = idea ? Number(idea.pool) : 0;
    const submitterFid = idea?.submitter_fid;

    // Determine outcome: approve requires > 50%, tie = rejected
    const totalVotes = build.votes_approve + build.votes_reject;
    const approved =
      totalVotes > 0 && build.votes_approve > build.votes_reject;

    if (approved) {
      // Build approved - process payouts
      const builderAmount = pool * PAYOUT_SPLIT.builder;
      const submitterAmount = pool * PAYOUT_SPLIT.submitter;
      const platformAmount = pool * PAYOUT_SPLIT.platform;

      // Create payout records
      const payoutRecords = [];

      // Builder payout
      payoutRecords.push({
        build_id: buildId,
        recipient_fid: build.builder_fid,
        amount: builderAmount,
        payout_type: "builder",
      });

      // Submitter payout (if exists)
      if (submitterFid) {
        payoutRecords.push({
          build_id: buildId,
          recipient_fid: submitterFid,
          amount: submitterAmount,
          payout_type: "submitter",
        });
      }

      // Platform payout
      payoutRecords.push({
        build_id: buildId,
        recipient_fid: PLATFORM_FID,
        amount: platformAmount,
        payout_type: "platform",
      });

      // Insert payout records
      const { error: payoutError } = await supabase
        .from("payouts")
        .insert(payoutRecords);

      if (payoutError) {
        console.error("Error creating payouts:", payoutError);
        return NextResponse.json(
          { error: "Failed to create payout records" },
          { status: 500 }
        );
      }

      // Credit builder balance
      const { data: builderUser } = await supabase
        .from("users")
        .select("balance, streak")
        .eq("fid", build.builder_fid)
        .single();

      await supabase
        .from("users")
        .update({
          balance: (builderUser?.balance || 0) + builderAmount,
          streak: (builderUser?.streak || 0) + 1,
        })
        .eq("fid", build.builder_fid);

      // Credit submitter balance (if exists)
      if (submitterFid) {
        const { data: submitterUser } = await supabase
          .from("users")
          .select("balance")
          .eq("fid", submitterFid)
          .single();

        await supabase
          .from("users")
          .update({
            balance: (submitterUser?.balance || 0) + submitterAmount,
          })
          .eq("fid", submitterFid);
      }

      // Update build status
      await supabase.from("builds").update({ status: "approved" }).eq("id", buildId);

      // Update idea status to completed
      // NOTE: Do NOT zero the pool here - the pool value is needed for
      // claim-reward calculations. The on-chain vault still holds the funds.
      // builder_reward_claimed and submitter_reward_claimed flags prevent double-claiming.
      await supabase
        .from("ideas")
        .update({ status: "completed" })
        .eq("id", build.idea_id);

      return NextResponse.json({
        status: "approved",
        build_id: buildId,
        outcome: {
          votes_approve: build.votes_approve,
          votes_reject: build.votes_reject,
          total_votes: totalVotes,
        },
        payouts: {
          builder: { fid: build.builder_fid, amount: builderAmount },
          submitter: submitterFid
            ? { fid: submitterFid, amount: submitterAmount }
            : null,
          platform: { fid: PLATFORM_FID, amount: platformAmount },
        },
      });
    } else {
      // Build rejected
      // Update build status (pool stays with idea for next builder)
      await supabase.from("builds").update({ status: "rejected" }).eq("id", buildId);

      // Reset builder streak on failed vote
      await supabase.from("users").update({ streak: 0 }).eq("fid", build.builder_fid);

      return NextResponse.json({
        status: "rejected",
        build_id: buildId,
        outcome: {
          votes_approve: build.votes_approve,
          votes_reject: build.votes_reject,
          total_votes: totalVotes,
        },
        message: "Build rejected. Pool remains for other builders.",
      });
    }
  } catch (error) {
    console.error("Resolve build error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
