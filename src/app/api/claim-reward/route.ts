import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import {
  signRewardClaim,
  usdcToBaseUnits,
  calculatePayouts,
  toProjectId,
  getRewardClaimed,
} from "~/lib/vault-signer";
import { validateAuth, validateFidMatch } from "~/lib/auth";

interface ClaimRewardRequest {
  user_fid: number;
  recipient: string; // wallet address
  idea_id: number; // v3: required - claim for specific project
}

/**
 * POST /api/claim-reward
 *
 * V3: Get a signed authorization for cumulative reward claim.
 * Backend calculates: cumAmt = onChainClaimed + eligibleReward
 * Contract pays: delta = cumAmt - onChainClaimed
 *
 * Reward breakdown:
 * - Builders: 85% of the project pool
 * - Idea Submitters: 5% of the project pool
 * - Platform: 10% stays in vault (collected separately)
 *
 * If user is both builder AND submitter, they get combined 90%.
 */
export async function POST(request: NextRequest) {
  try {
    // Validate authentication
    const auth = await validateAuth(request);
    if (!auth.authenticated || !auth.fid) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as ClaimRewardRequest;

    if (!body.user_fid) {
      return NextResponse.json(
        { error: "Missing required field: user_fid" },
        { status: 400 }
      );
    }

    if (!body.idea_id) {
      return NextResponse.json(
        { error: "Missing required field: idea_id" },
        { status: 400 }
      );
    }

    // Verify authenticated user matches requested FID
    const fidError = validateFidMatch(auth.fid, body.user_fid);
    if (fidError) {
      return NextResponse.json({ error: fidError }, { status: 403 });
    }

    if (!body.recipient || !body.recipient.startsWith("0x")) {
      return NextResponse.json(
        { error: "Invalid recipient wallet address" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Get the specific idea
    const { data: idea, error: ideaError } = await supabase
      .from("ideas")
      .select("id, pool, status, submitter_fid, builder_reward_claimed, submitter_reward_claimed")
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

    // Check if user is the builder of this idea
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

    // Convert idea ID to bytes32 projectId for v3 contract
    const projectId = toProjectId(body.idea_id);

    // V3: Get on-chain cumulative claimed amount FIRST
    // CRITICAL: If RPC fails, we must NOT proceed with potentially stale data
    let onChainClaimed: bigint;
    try {
      onChainClaimed = await getRewardClaimed(projectId, BigInt(body.user_fid));
    } catch (error) {
      console.error("Failed to read on-chain claimed amount:", error);
      return NextResponse.json(
        { error: "Failed to verify on-chain state" },
        { status: 503 }
      );
    }

    // Calculate TOTAL reward this user is EVER entitled to for this project
    // V3 SECURITY: Use total entitlement, not DB-unclaimed
    // This prevents double-claims if DB record-reward was skipped
    const payouts = calculatePayouts(usdcToBaseUnits(Number(idea.pool)));
    let totalRewardEntitlement = 0n;
    let builderReward = 0;
    let submitterReward = 0;

    // Builder gets 85% if they're the approved builder
    if (isBuilder) {
      builderReward = Number(payouts.builderPayout) / 1_000_000;
      totalRewardEntitlement += payouts.builderPayout;
    }

    // Submitter gets 5% if they're the idea submitter
    if (isSubmitter) {
      submitterReward = Number(payouts.ideaCreatorFee) / 1_000_000;
      totalRewardEntitlement += payouts.ideaCreatorFee;
    }

    if (totalRewardEntitlement === 0n) {
      return NextResponse.json(
        { error: "No rewards available for this user on this project" },
        { status: 400 }
      );
    }

    // V3 SECURITY: cumAmt = total entitlement (not onChainClaimed + dbEligible)
    // Contract will pay: delta = cumAmt - onChainClaimed
    // This is safe because:
    // - cumAmt is based on fixed pool amount and role
    // - Contract only pays the delta since last claim
    // - Even if DB flags are out of sync, on-chain state prevents double-pay
    const cumAmt = totalRewardEntitlement;

    // Check if there's anything new to claim
    if (cumAmt <= onChainClaimed) {
      return NextResponse.json(
        { error: "No rewards available - all rewards already claimed" },
        { status: 400 }
      );
    }

    // Calculate actual amount that will be transferred (for UI display)
    const deltaAmount = cumAmt - onChainClaimed;
    const deltaUsdc = Number(deltaAmount) / 1_000_000;

    const signedClaim = await signRewardClaim({
      projectId,
      fid: BigInt(body.user_fid),
      recipientAddress: body.recipient,
      cumAmt,
    });

    return NextResponse.json({
      success: true,
      fid: body.user_fid,
      recipient: body.recipient,
      ideaId: body.idea_id,
      projectId: signedClaim.projectId,
      cumAmt: signedClaim.cumAmt,
      amountUsdc: deltaUsdc, // The delta that will be transferred
      totalEntitlement: Number(totalRewardEntitlement) / 1_000_000,
      onChainClaimed: onChainClaimed.toString(),
      deadline: signedClaim.deadline,
      signature: signedClaim.signature,
      breakdown: {
        builderReward,
        submitterReward,
        isBuilder,
        isSubmitter,
      },
    });
  } catch (error) {
    console.error("Claim reward error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/claim-reward?fid=12345
 *
 * V3: Check available rewards for a user using on-chain state as source of truth.
 * For each project, we check on-chain rewardClaimed to determine actual claimable amount.
 */
export async function GET(request: NextRequest) {
  const fid = request.nextUrl.searchParams.get("fid");

  if (!fid) {
    return NextResponse.json(
      { error: "Missing required parameter: fid" },
      { status: 400 }
    );
  }

  const userFid = parseInt(fid, 10);
  if (isNaN(userFid)) {
    return NextResponse.json({ error: "Invalid fid" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();

    // Get all approved builds by this user for completed projects
    const { data: builderBuilds } = await supabase
      .from("builds")
      .select(`
        id,
        idea_id,
        ideas!inner(pool, status, title, submitter_fid)
      `)
      .eq("builder_fid", userFid)
      .eq("status", "approved");

    // Get all completed ideas submitted by this user
    const { data: submittedIdeas } = await supabase
      .from("ideas")
      .select("id, pool, status, title")
      .eq("submitter_fid", userFid)
      .eq("status", "completed");

    // Collect all unique idea IDs to check on-chain
    const ideaIdsToCheck = new Set<number>();

    for (const build of builderBuilds || []) {
      const ideaInfo = build.ideas as unknown as { status: string };
      if (ideaInfo.status === "completed") {
        ideaIdsToCheck.add(build.idea_id);
      }
    }

    for (const idea of submittedIdeas || []) {
      ideaIdsToCheck.add(idea.id);
    }

    // V3: Check on-chain claimed amounts for each project
    // This is authoritative - DB flags may be out of sync
    const onChainClaimed = new Map<number, bigint>();

    for (const ideaId of ideaIdsToCheck) {
      try {
        const projectId = toProjectId(ideaId);
        const claimed = await getRewardClaimed(projectId, BigInt(userFid));
        onChainClaimed.set(ideaId, claimed);
      } catch (error) {
        // If RPC fails for a project, skip it (don't show as claimable)
        console.error(`Failed to get on-chain claimed for idea ${ideaId}:`, error);
        onChainClaimed.set(ideaId, BigInt(Number.MAX_SAFE_INTEGER)); // Treat as fully claimed
      }
    }

    // Calculate builder rewards using on-chain state
    let builderRewardsUsdc = 0;
    const builderProjects: Array<{ idea_id: number; title: string; reward: number; claimable: number }> = [];

    for (const build of builderBuilds || []) {
      const ideaInfo = build.ideas as unknown as {
        pool: number;
        status: string;
        title: string;
        submitter_fid: number;
      };

      if (ideaInfo.status !== "completed") continue;

      const payouts = calculatePayouts(usdcToBaseUnits(Number(ideaInfo.pool)));
      const builderReward = payouts.builderPayout;

      // Check if user is also submitter (gets both rewards)
      const isAlsoSubmitter = ideaInfo.submitter_fid === userFid;
      const totalEntitlement = isAlsoSubmitter
        ? builderReward + payouts.ideaCreatorFee
        : builderReward;

      const claimed = onChainClaimed.get(build.idea_id) ?? 0n;
      const claimable = totalEntitlement > claimed ? totalEntitlement - claimed : 0n;
      const claimableUsdc = Number(claimable) / 1_000_000;

      if (claimableUsdc > 0) {
        builderRewardsUsdc += claimableUsdc;
        builderProjects.push({
          idea_id: build.idea_id,
          title: ideaInfo.title,
          reward: Number(builderReward) / 1_000_000,
          claimable: claimableUsdc,
        });
      }
    }

    // Calculate submitter rewards using on-chain state
    // Skip if already counted as builder (to avoid double-counting)
    let submitterRewardsUsdc = 0;
    const submittedIdeaList: Array<{ idea_id: number; title: string; reward: number; claimable: number }> = [];
    const builderIdeaIds = new Set(builderProjects.map(p => p.idea_id));

    for (const idea of submittedIdeas || []) {
      // Skip if already counted in builder rewards
      if (builderIdeaIds.has(idea.id)) continue;

      const payouts = calculatePayouts(usdcToBaseUnits(Number(idea.pool)));
      const submitterReward = payouts.ideaCreatorFee;

      const claimed = onChainClaimed.get(idea.id) ?? 0n;
      const claimable = submitterReward > claimed ? submitterReward - claimed : 0n;
      const claimableUsdc = Number(claimable) / 1_000_000;

      if (claimableUsdc > 0) {
        submitterRewardsUsdc += claimableUsdc;
        submittedIdeaList.push({
          idea_id: idea.id,
          title: idea.title,
          reward: Number(submitterReward) / 1_000_000,
          claimable: claimableUsdc,
        });
      }
    }

    return NextResponse.json({
      fid: userFid,
      totalRewards: builderRewardsUsdc + submitterRewardsUsdc,
      builderRewards: builderRewardsUsdc,
      submitterRewards: submitterRewardsUsdc,
      builderProjects,
      submittedIdeas: submittedIdeaList,
    });
  } catch (error) {
    console.error("Get rewards error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
