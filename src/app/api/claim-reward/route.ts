import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import {
  signRewardClaim,
  usdcToBaseUnits,
  calculatePayouts,
  getLastClaimedReward,
} from "~/lib/vault-signer";
import { validateAuth, validateFidMatch } from "~/lib/auth";

interface ClaimRewardRequest {
  user_fid: number;
  recipient: string; // wallet address
}

/**
 * POST /api/claim-reward
 *
 * Get a signed authorization to claim rewards as a builder or idea submitter.
 * The contract uses cumulative amounts by FID, so we calculate total rewards
 * across ALL completed projects where the user is builder or submitter.
 *
 * Reward breakdown:
 * - Builders: 85% of each project pool they completed
 * - Idea Submitters: 5% of each project pool for their ideas
 * - Platform: 10% stays in vault (collected separately)
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

    // Get all APPROVED builds by this user (builder rewards - 85%)
    // IMPORTANT: Join with ideas to check if builder_reward_claimed is false
    const { data: builderBuilds, error: builderError } = await supabase
      .from("builds")
      .select(`
        id,
        idea_id,
        ideas!inner(pool, status, builder_reward_claimed)
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

    // Get all completed ideas submitted by this user (submitter rewards - 5%)
    // IMPORTANT: Only get ideas where submitter_reward_claimed is false
    const { data: submittedIdeas, error: submitterError } = await supabase
      .from("ideas")
      .select("id, pool, status, submitter_reward_claimed")
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

    // Calculate builder rewards (85% of each completed project pool)
    // IMPORTANT: Only include ideas where builder_reward_claimed is false
    let builderRewardsUsdc = 0;
    const builderBreakdown: Array<{ idea_id: number; pool: number; reward: number }> = [];

    for (const build of builderBuilds || []) {
      const ideaInfo = build.ideas as unknown as {
        pool: number;
        status: string;
        builder_reward_claimed: boolean;
      };
      // Only count unclaimed rewards for completed projects
      if (ideaInfo.status === "completed" && !ideaInfo.builder_reward_claimed) {
        const payouts = calculatePayouts(usdcToBaseUnits(Number(ideaInfo.pool)));
        const rewardUsdc = Number(payouts.builderPayout) / 1_000_000; // Convert back to USDC
        builderRewardsUsdc += rewardUsdc;
        builderBreakdown.push({
          idea_id: build.idea_id,
          pool: Number(ideaInfo.pool),
          reward: rewardUsdc,
        });
      }
    }

    // Calculate submitter rewards (5% of each completed project pool)
    let submitterRewardsUsdc = 0;
    const submitterBreakdown: Array<{ idea_id: number; pool: number; reward: number }> = [];

    for (const idea of submittedIdeas || []) {
      const payouts = calculatePayouts(usdcToBaseUnits(Number(idea.pool)));
      const rewardUsdc = Number(payouts.ideaCreatorFee) / 1_000_000; // Convert back to USDC
      submitterRewardsUsdc += rewardUsdc;
      submitterBreakdown.push({
        idea_id: idea.id,
        pool: Number(idea.pool),
        reward: rewardUsdc,
      });
    }

    // Total NEW reward from DB (unclaimed rewards in our system)
    const newRewardUsdc = builderRewardsUsdc + submitterRewardsUsdc;

    if (newRewardUsdc <= 0) {
      return NextResponse.json(
        { error: "No rewards available for this user" },
        { status: 400 }
      );
    }

    // SECURITY: To prevent double-claims if record-reward is skipped,
    // calculate TOTAL eligible rewards across ALL completed projects
    // (ignoring the claimed flags) and compare against on-chain lastClaimedReward

    // Get ALL approved builds (regardless of claimed flag)
    const { data: allBuilderBuilds } = await supabase
      .from("builds")
      .select("idea_id, ideas!inner(pool, status)")
      .eq("builder_fid", body.user_fid)
      .eq("status", "approved");

    // Get ALL completed submitted ideas (regardless of claimed flag)
    const { data: allSubmittedIdeas } = await supabase
      .from("ideas")
      .select("id, pool, status")
      .eq("submitter_fid", body.user_fid)
      .eq("status", "completed");

    // Calculate total eligible builder rewards
    let totalBuilderEligible = 0;
    for (const build of allBuilderBuilds || []) {
      const ideaInfo = build.ideas as unknown as { pool: number; status: string };
      if (ideaInfo.status === "completed") {
        const payouts = calculatePayouts(usdcToBaseUnits(Number(ideaInfo.pool)));
        totalBuilderEligible += Number(payouts.builderPayout) / 1_000_000;
      }
    }

    // Calculate total eligible submitter rewards
    let totalSubmitterEligible = 0;
    for (const idea of allSubmittedIdeas || []) {
      const payouts = calculatePayouts(usdcToBaseUnits(Number(idea.pool)));
      totalSubmitterEligible += Number(payouts.ideaCreatorFee) / 1_000_000;
    }

    const totalEligibleUsdc = totalBuilderEligible + totalSubmitterEligible;
    const totalEligibleBaseUnits = usdcToBaseUnits(totalEligibleUsdc);

    // Query on-chain state for cumulative amount already claimed
    const lastClaimed = await getLastClaimedReward(BigInt(body.user_fid));

    // CRITICAL: Compute new cumulative as max(lastClaimed, totalEligible)
    // This ensures we never sign for less than already claimed (which would fail)
    // and never sign for more than total eligible (prevents over-claiming)
    const cumulativeAmount = totalEligibleBaseUnits > lastClaimed
      ? totalEligibleBaseUnits
      : lastClaimed;

    // Calculate actual delta user will receive
    const deltaAmount = cumulativeAmount - lastClaimed;
    if (deltaAmount <= 0n) {
      return NextResponse.json(
        { error: "No new rewards available - already claimed on-chain" },
        { status: 400 }
      );
    }

    // Sign the claim with the cumulative amount (last claimed + new)
    const signedClaim = await signRewardClaim({
      fid: BigInt(body.user_fid),
      recipientAddress: body.recipient,
      cumulativeAmount,
    });

    return NextResponse.json({
      success: true,
      fid: body.user_fid,
      recipient: body.recipient,
      cumulativeAmount: signedClaim.cumAmt,
      cumulativeAmountUsdc: Number(cumulativeAmount) / 1_000_000,
      deltaAmount: deltaAmount.toString(),
      deltaAmountUsdc: Number(deltaAmount) / 1_000_000,
      deadline: signedClaim.deadline,
      signature: signedClaim.signature,
      // Include breakdown for transparency
      breakdown: {
        builderRewards: builderRewardsUsdc,
        submitterRewards: submitterRewardsUsdc,
        dbUnclaimed: newRewardUsdc,
        previouslyClaimed: Number(lastClaimed) / 1_000_000,
        builderProjects: builderBreakdown,
        submittedIdeas: submitterBreakdown,
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
 * Check available rewards for a user (without signing)
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

    // Get all approved builds by this user
    // Include builder_reward_claimed to filter out already-claimed
    const { data: builderBuilds } = await supabase
      .from("builds")
      .select(`
        id,
        idea_id,
        ideas!inner(pool, status, title, builder_reward_claimed)
      `)
      .eq("builder_fid", userFid)
      .eq("status", "approved");

    // Get all completed ideas submitted by this user
    // Only get ideas where submitter_reward_claimed is false
    const { data: submittedIdeas } = await supabase
      .from("ideas")
      .select("id, pool, status, title, submitter_reward_claimed")
      .eq("submitter_fid", userFid)
      .eq("status", "completed")
      .eq("submitter_reward_claimed", false);

    // Calculate builder rewards
    // Only include unclaimed rewards
    let builderRewardsUsdc = 0;
    const builderProjects: Array<{ idea_id: number; title: string; reward: number }> = [];

    for (const build of builderBuilds || []) {
      const ideaInfo = build.ideas as unknown as {
        pool: number;
        status: string;
        title: string;
        builder_reward_claimed: boolean;
      };
      // Only count unclaimed rewards for completed projects
      if (ideaInfo.status === "completed" && !ideaInfo.builder_reward_claimed) {
        const payouts = calculatePayouts(usdcToBaseUnits(Number(ideaInfo.pool)));
        const rewardUsdc = Number(payouts.builderPayout) / 1_000_000;
        builderRewardsUsdc += rewardUsdc;
        builderProjects.push({
          idea_id: build.idea_id,
          title: ideaInfo.title,
          reward: rewardUsdc,
        });
      }
    }

    // Calculate submitter rewards
    let submitterRewardsUsdc = 0;
    const submittedIdeaList: Array<{ idea_id: number; title: string; reward: number }> = [];

    for (const idea of submittedIdeas || []) {
      const payouts = calculatePayouts(usdcToBaseUnits(Number(idea.pool)));
      const rewardUsdc = Number(payouts.ideaCreatorFee) / 1_000_000;
      submitterRewardsUsdc += rewardUsdc;
      submittedIdeaList.push({
        idea_id: idea.id,
        title: idea.title,
        reward: rewardUsdc,
      });
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
