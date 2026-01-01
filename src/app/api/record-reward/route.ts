import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { validateAuth, validateFidMatch } from "~/lib/auth";
import { verifyRewardTransaction } from "~/lib/vault-signer";
import { BUILDER_FEE_PERCENT, SUBMITTER_FEE_PERCENT } from "~/lib/constants";

interface RecordRewardRequest {
  user_fid: number;
  tx_hash: string;
  amount: number; // Total amount claimed in USDC
}

/**
 * POST /api/record-reward
 *
 * Record a successful reward claim after on-chain transaction.
 * This updates:
 * 1. Checks tx_hash against history table (prevents ALL replay)
 * 2. Verifies on-chain delta matches DB-eligible rewards
 * 3. Marks ideas as builder_reward_claimed or submitter_reward_claimed
 * 4. Records tx_hash in history table
 * 5. Updates user's claimed_rewards total
 *
 * CRITICAL: tx_hash is checked against history table, not just last_tx_hash.
 * CRITICAL: On-chain delta must match eligible rewards to prevent drift.
 * SECURITY: Requires authentication and FID must match.
 */
export async function POST(request: NextRequest) {
  try {
    // Validate authentication
    const auth = await validateAuth(request);
    if (!auth.authenticated || !auth.fid) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as RecordRewardRequest;

    if (!body.user_fid) {
      return NextResponse.json(
        { error: "Missing required field: user_fid" },
        { status: 400 }
      );
    }

    // Verify authenticated user matches requested FID
    const fidError = validateFidMatch(auth.fid, body.user_fid);
    if (fidError) {
      return NextResponse.json({ error: fidError }, { status: 403 });
    }

    if (!body.tx_hash || !body.tx_hash.startsWith("0x")) {
      return NextResponse.json(
        { error: "Missing or invalid tx_hash" },
        { status: 400 }
      );
    }

    if (!body.amount || body.amount <= 0) {
      return NextResponse.json(
        { error: "Missing or invalid amount" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // CRITICAL: Check if this tx_hash has EVER been used for a reward claim
    // This prevents replay of ANY older transaction, not just the last one
    const { data: existingTx } = await supabase
      .from("used_claim_tx")
      .select("tx_hash")
      .eq("tx_hash", body.tx_hash)
      .eq("claim_type", "reward")
      .single();

    if (existingTx) {
      return NextResponse.json(
        { error: "Reward transaction has already been recorded" },
        { status: 409 }
      );
    }

    // Also check legacy: idea with this tx_hash or user with this last_reward_tx_hash
    const { data: existingIdeaClaim } = await supabase
      .from("ideas")
      .select("id")
      .eq("reward_claim_tx_hash", body.tx_hash)
      .limit(1)
      .single();

    if (existingIdeaClaim) {
      return NextResponse.json(
        { error: "Reward transaction has already been recorded" },
        { status: 409 }
      );
    }

    const { data: user, error: userFetchError } = await supabase
      .from("users")
      .select("claimed_rewards, last_reward_tx_hash")
      .eq("fid", body.user_fid)
      .single();

    if (userFetchError && userFetchError.code !== "PGRST116") {
      console.error("Error fetching user:", userFetchError);
      return NextResponse.json(
        { error: "Failed to fetch user" },
        { status: 500 }
      );
    }

    // Legacy check
    if (user?.last_reward_tx_hash === body.tx_hash) {
      return NextResponse.json(
        { error: "Reward transaction has already been recorded" },
        { status: 409 }
      );
    }

    // SECURITY: Verify the reward transaction on-chain before updating DB
    const verification = await verifyRewardTransaction(body.tx_hash, body.user_fid);
    if (!verification.verified) {
      return NextResponse.json(
        { error: verification.error || "Transaction verification failed" },
        { status: 400 }
      );
    }

    // The on-chain delta is the authoritative amount
    const onChainDeltaUsdc = verification.amount > 0n
      ? Number(verification.amount) / 1_000_000
      : body.amount;

    // Find all completed ideas where user is builder (with approved build) and hasn't claimed
    const { data: builderBuilds, error: builderError } = await supabase
      .from("builds")
      .select(`
        id,
        idea_id,
        ideas!inner(id, status, builder_reward_claimed, pool)
      `)
      .eq("builder_fid", body.user_fid)
      .eq("status", "approved");

    if (builderError) {
      console.error("Error fetching builder builds:", builderError);
      return NextResponse.json(
        { error: "Failed to fetch builder data" },
        { status: 500 }
      );
    }

    // Find all completed ideas where user is submitter and hasn't claimed
    const { data: submittedIdeas, error: submitterError } = await supabase
      .from("ideas")
      .select("id, status, submitter_reward_claimed, pool")
      .eq("submitter_fid", body.user_fid)
      .eq("status", "completed")
      .eq("submitter_reward_claimed", false);

    if (submitterError) {
      console.error("Error fetching submitted ideas:", submitterError);
      return NextResponse.json(
        { error: "Failed to fetch submitter data" },
        { status: 500 }
      );
    }

    // Calculate expected rewards
    let totalEligibleRewards = 0;

    const builderIdeaIds: number[] = [];
    for (const build of builderBuilds || []) {
      const ideaInfo = build.ideas as unknown as {
        id: number;
        status: string;
        builder_reward_claimed: boolean;
        pool: number;
      };
      if (ideaInfo.status === "completed" && !ideaInfo.builder_reward_claimed) {
        builderIdeaIds.push(ideaInfo.id);
        // Builder gets BUILDER_FEE_PERCENT of pool
        totalEligibleRewards += Number(ideaInfo.pool) * (BUILDER_FEE_PERCENT / 100);
      }
    }

    const submitterIdeaIds: number[] = [];
    for (const idea of submittedIdeas || []) {
      submitterIdeaIds.push(idea.id);
      // Submitter gets SUBMITTER_FEE_PERCENT of pool
      totalEligibleRewards += Number(idea.pool) * (SUBMITTER_FEE_PERCENT / 100);
    }

    // SECURITY: Verify on-chain delta matches eligible rewards
    // Allow small tolerance for rounding (0.01 USDC)
    const tolerance = 0.01;
    if (verification.amount > 0n && Math.abs(onChainDeltaUsdc - totalEligibleRewards) > tolerance) {
      console.error(
        `On-chain delta mismatch: on-chain=${onChainDeltaUsdc}, eligible=${totalEligibleRewards}`
      );
      return NextResponse.json(
        {
          error: "On-chain reward amount does not match eligible rewards",
          on_chain_delta: onChainDeltaUsdc,
          eligible_total: totalEligibleRewards,
        },
        { status: 400 }
      );
    }

    // FIRST: Record the tx_hash in history table BEFORE making any changes
    const { error: insertTxError } = await supabase
      .from("used_claim_tx")
      .insert({
        tx_hash: body.tx_hash,
        user_fid: body.user_fid,
        claim_type: "reward",
        amount: onChainDeltaUsdc,
      });

    if (insertTxError) {
      // If insert fails due to unique constraint, tx was already used
      if (insertTxError.code === "23505") {
        return NextResponse.json(
          { error: "Reward transaction has already been recorded" },
          { status: 409 }
        );
      }
      console.error("Error recording tx_hash:", insertTxError);
      return NextResponse.json(
        { error: "Failed to record transaction" },
        { status: 500 }
      );
    }

    // Mark builder rewards as claimed
    if (builderIdeaIds.length > 0) {
      const { error: updateBuilderError } = await supabase
        .from("ideas")
        .update({
          builder_reward_claimed: true,
          reward_claim_tx_hash: body.tx_hash,
        })
        .in("id", builderIdeaIds);

      if (updateBuilderError) {
        console.error("Error updating builder claims:", updateBuilderError);
        // Don't fail - tx_hash is already recorded
      }
    }

    // Mark submitter rewards as claimed
    if (submitterIdeaIds.length > 0) {
      const { error: updateSubmitterError } = await supabase
        .from("ideas")
        .update({
          submitter_reward_claimed: true,
          reward_claim_tx_hash: body.tx_hash,
        })
        .in("id", submitterIdeaIds);

      if (updateSubmitterError) {
        console.error("Error updating submitter claims:", updateSubmitterError);
        // Don't fail - tx_hash is already recorded
      }
    }

    // Update user's claimed_rewards total
    const newClaimedRewards = (Number(user?.claimed_rewards) || 0) + onChainDeltaUsdc;
    const { error: updateUserError } = await supabase
      .from("users")
      .update({
        claimed_rewards: newClaimedRewards,
        last_reward_tx_hash: body.tx_hash,
      })
      .eq("fid", body.user_fid);

    if (updateUserError) {
      console.error("Error updating user:", updateUserError);
      // Don't fail - tx_hash is already recorded
    }

    return NextResponse.json({
      success: true,
      builder_ideas_claimed: builderIdeaIds.length,
      submitter_ideas_claimed: submitterIdeaIds.length,
      total_claimed: onChainDeltaUsdc,
      tx_hash: body.tx_hash,
    });
  } catch (error) {
    console.error("Record reward error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
