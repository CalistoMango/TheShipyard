import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { validateAuth, validateFidMatch } from "~/lib/auth";
import { verifyRewardTransaction, toProjectId } from "~/lib/vault-signer";
import { BUILDER_FEE_PERCENT, SUBMITTER_FEE_PERCENT, AMOUNT_TOLERANCE_USDC } from "~/lib/constants";
import { checkTxHashNotUsed, recordTxHashUsed, verifyOnChainDelta } from "~/lib/transactions";

interface RecordRewardRequest {
  user_fid: number;
  tx_hash: string;
  amount: number; // Total amount claimed in USDC
  idea_id: number; // v2: required - record reward for specific project
}

/**
 * POST /api/record-reward
 *
 * Record a successful reward claim after on-chain transaction.
 * V2: Per-project reward recording - only marks claims for the specific idea.
 *
 * This endpoint:
 * 1. Checks tx_hash against history table (prevents replay)
 * 2. Verifies on-chain amount matches expected reward for THIS idea
 * 3. Marks builder_reward_claimed or submitter_reward_claimed for THIS idea
 * 4. Records tx_hash in history table
 * 5. Updates user's claimed_rewards total
 *
 * SECURITY: Requires authentication and FID must match.
 * V2: Each (projectId, fid) pair can only claim once on-chain.
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

    // v2: idea_id is required
    if (!body.idea_id) {
      return NextResponse.json(
        { error: "Missing required field: idea_id" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // CRITICAL: Check if this tx_hash has EVER been used for a reward claim
    const txCheck = await checkTxHashNotUsed(body.tx_hash, "reward", body.user_fid);
    if (txCheck.used) {
      return NextResponse.json({ error: txCheck.error }, { status: 409 });
    }

    // Fetch user for claimed_rewards tracking
    const { data: user, error: userFetchError } = await supabase
      .from("users")
      .select("claimed_rewards")
      .eq("fid", body.user_fid)
      .single();

    if (userFetchError && userFetchError.code !== "PGRST116") {
      console.error("Error fetching user:", userFetchError);
      return NextResponse.json(
        { error: "Failed to fetch user" },
        { status: 500 }
      );
    }

    // v2: Convert idea ID to projectId for on-chain verification
    const projectId = toProjectId(body.idea_id);

    // SECURITY: Verify the reward transaction on-chain with projectId (v2)
    const verification = await verifyRewardTransaction(body.tx_hash, body.user_fid, projectId);
    if (!verification.verified) {
      return NextResponse.json(
        { error: verification.error || "Transaction verification failed" },
        { status: 400 }
      );
    }

    // The on-chain amount is the authoritative amount
    const onChainAmountUsdc = verification.amount > 0n
      ? Number(verification.amount) / 1_000_000
      : body.amount;

    // v2: Get the specific idea and check user's role
    const { data: idea, error: ideaError } = await supabase
      .from("ideas")
      .select("id, status, pool, submitter_fid, builder_reward_claimed, submitter_reward_claimed")
      .eq("id", body.idea_id)
      .single();

    if (ideaError || !idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    if (idea.status !== "completed") {
      return NextResponse.json(
        { error: "Rewards are only available for completed projects" },
        { status: 400 }
      );
    }

    // Check if user is builder of this idea
    const { data: builderBuild } = await supabase
      .from("builds")
      .select("id")
      .eq("idea_id", body.idea_id)
      .eq("builder_fid", body.user_fid)
      .eq("status", "approved")
      .maybeSingle();

    const isBuilder = !!builderBuild;
    const isSubmitter = idea.submitter_fid === body.user_fid;

    if (!isBuilder && !isSubmitter) {
      return NextResponse.json(
        { error: "You are not the builder or submitter of this project" },
        { status: 400 }
      );
    }

    // Calculate expected reward for THIS idea
    let expectedReward = 0;
    let claimBuilder = false;
    let claimSubmitter = false;

    if (isBuilder && !idea.builder_reward_claimed) {
      expectedReward += Number(idea.pool) * (BUILDER_FEE_PERCENT / 100);
      claimBuilder = true;
    }

    if (isSubmitter && !idea.submitter_reward_claimed) {
      expectedReward += Number(idea.pool) * (SUBMITTER_FEE_PERCENT / 100);
      claimSubmitter = true;
    }

    if (expectedReward === 0) {
      return NextResponse.json(
        { error: "No unclaimed rewards available for this project" },
        { status: 400 }
      );
    }

    // SECURITY: Verify on-chain amount matches expected reward for THIS idea
    const deltaCheck = verifyOnChainDelta(verification.amount, expectedReward, AMOUNT_TOLERANCE_USDC);
    if (!deltaCheck.matches) {
      console.error(
        `On-chain amount mismatch: on-chain=${deltaCheck.onChainUsdc}, expected=${expectedReward}`
      );
      return NextResponse.json(
        {
          error: "On-chain reward amount does not match expected reward",
          on_chain_amount: deltaCheck.onChainUsdc,
          expected_total: expectedReward,
        },
        { status: 400 }
      );
    }

    // FIRST: Record the tx_hash in history table BEFORE making any changes
    const txRecord = await recordTxHashUsed(body.tx_hash, "reward", body.user_fid, onChainAmountUsdc, body.idea_id);
    if (!txRecord.success) {
      return NextResponse.json(
        { error: txRecord.error },
        { status: txRecord.alreadyUsed ? 409 : 500 }
      );
    }

    // Update THIS idea's reward claim flags
    const updateFields: Record<string, boolean | string> = {
      reward_claim_tx_hash: body.tx_hash,
    };
    if (claimBuilder) {
      updateFields.builder_reward_claimed = true;
    }
    if (claimSubmitter) {
      updateFields.submitter_reward_claimed = true;
    }

    const { error: updateIdeaError } = await supabase
      .from("ideas")
      .update(updateFields)
      .eq("id", body.idea_id);

    if (updateIdeaError) {
      console.error("Error updating idea claims:", updateIdeaError);
      // Don't fail - tx_hash is already recorded
    }

    // Update user's claimed_rewards total
    const newClaimedRewards = (Number(user?.claimed_rewards) || 0) + onChainAmountUsdc;
    const { error: updateUserError } = await supabase
      .from("users")
      .update({
        claimed_rewards: newClaimedRewards,
        last_reward_tx_hash: body.tx_hash,
      })
      .eq("fid", body.user_fid);

    if (updateUserError) {
      console.error("Error updating user:", updateUserError);
    }

    return NextResponse.json({
      success: true,
      idea_id: body.idea_id,
      project_id: projectId,
      builder_reward_claimed: claimBuilder,
      submitter_reward_claimed: claimSubmitter,
      total_claimed: onChainAmountUsdc,
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
