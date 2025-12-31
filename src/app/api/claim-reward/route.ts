import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import {
  signRewardClaim,
  usdcToBaseUnits,
  calculatePayouts,
} from "~/lib/vault-signer";

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
    const body = (await request.json()) as ClaimRewardRequest;

    if (!body.user_fid) {
      return NextResponse.json(
        { error: "Missing required field: user_fid" },
        { status: 400 }
      );
    }

    if (!body.recipient || !body.recipient.startsWith("0x")) {
      return NextResponse.json(
        { error: "Invalid recipient wallet address" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Get all APPROVED builds by this user (builder rewards - 85%)
    const { data: builderBuilds, error: builderError } = await supabase
      .from("builds")
      .select(`
        id,
        idea_id,
        ideas!inner(pool, status)
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
    const { data: submittedIdeas, error: submitterError } = await supabase
      .from("ideas")
      .select("id, pool, status")
      .eq("submitter_fid", body.user_fid)
      .eq("status", "completed");

    if (submitterError) {
      console.error("Error fetching submitted ideas:", submitterError);
      return NextResponse.json(
        { error: "Failed to fetch submitter data" },
        { status: 500 }
      );
    }

    // Calculate builder rewards (85% of each completed project pool)
    let builderRewardsUsdc = 0;
    const builderBreakdown: Array<{ idea_id: number; pool: number; reward: number }> = [];

    for (const build of builderBuilds || []) {
      const ideaInfo = build.ideas as unknown as { pool: number; status: string };
      if (ideaInfo.status === "completed") {
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

    // Total cumulative reward
    const cumulativeRewardUsdc = builderRewardsUsdc + submitterRewardsUsdc;

    if (cumulativeRewardUsdc <= 0) {
      return NextResponse.json(
        { error: "No rewards available for this user" },
        { status: 400 }
      );
    }

    // Convert to USDC base units (6 decimals)
    const cumulativeAmount = usdcToBaseUnits(cumulativeRewardUsdc);

    // Sign the claim
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
      cumulativeAmountUsdc: cumulativeRewardUsdc,
      deadline: signedClaim.deadline,
      signature: signedClaim.signature,
      // Include breakdown for transparency
      breakdown: {
        builderRewards: builderRewardsUsdc,
        submitterRewards: submitterRewardsUsdc,
        total: cumulativeRewardUsdc,
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
    const { data: builderBuilds } = await supabase
      .from("builds")
      .select(`
        id,
        idea_id,
        ideas!inner(pool, status, title)
      `)
      .eq("builder_fid", userFid)
      .eq("status", "approved");

    // Get all completed ideas submitted by this user
    const { data: submittedIdeas } = await supabase
      .from("ideas")
      .select("id, pool, status, title")
      .eq("submitter_fid", userFid)
      .eq("status", "completed");

    // Calculate builder rewards
    let builderRewardsUsdc = 0;
    const builderProjects: Array<{ idea_id: number; title: string; reward: number }> = [];

    for (const build of builderBuilds || []) {
      const ideaInfo = build.ideas as unknown as {
        pool: number;
        status: string;
        title: string;
      };
      if (ideaInfo.status === "completed") {
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
