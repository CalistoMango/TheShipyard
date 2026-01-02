import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import {
  signRewardClaim,
  usdcToBaseUnits,
  calculatePayouts,
  toProjectId,
  hasClaimedReward,
} from "~/lib/vault-signer";
import { validateAuth, validateFidMatch } from "~/lib/auth";

interface ClaimRewardRequest {
  user_fid: number;
  recipient: string; // wallet address
  idea_id: number; // v2: required - claim for specific project
}

/**
 * POST /api/claim-reward
 *
 * Get a signed authorization to claim rewards as a builder or idea submitter
 * for a SPECIFIC project (v2: per-project claim tracking).
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

    // Calculate reward for this user on this project
    const payouts = calculatePayouts(usdcToBaseUnits(Number(idea.pool)));
    let rewardAmount = 0n;
    let builderReward = 0;
    let submitterReward = 0;

    if (isBuilder && !idea.builder_reward_claimed) {
      builderReward = Number(payouts.builderPayout) / 1_000_000;
      rewardAmount += payouts.builderPayout;
    }

    if (isSubmitter && !idea.submitter_reward_claimed) {
      submitterReward = Number(payouts.ideaCreatorFee) / 1_000_000;
      rewardAmount += payouts.ideaCreatorFee;
    }

    if (rewardAmount === 0n) {
      return NextResponse.json(
        { error: "No unclaimed rewards available for this project" },
        { status: 400 }
      );
    }

    // Convert idea ID to bytes32 projectId for v2 contract
    const projectId = toProjectId(body.idea_id);

    // Check if already claimed on-chain (v2: per-project tracking)
    const alreadyClaimed = await hasClaimedReward(projectId, BigInt(body.user_fid));
    if (alreadyClaimed) {
      return NextResponse.json(
        { error: "Reward already claimed for this project" },
        { status: 400 }
      );
    }

    // Sign the claim for this specific project (v2: per-project)
    const signedClaim = await signRewardClaim({
      projectId,
      fid: BigInt(body.user_fid),
      recipientAddress: body.recipient,
      amount: rewardAmount,
    });

    const totalRewardUsdc = builderReward + submitterReward;

    return NextResponse.json({
      success: true,
      fid: body.user_fid,
      recipient: body.recipient,
      ideaId: body.idea_id,
      projectId: signedClaim.projectId,
      amount: signedClaim.amount,
      amountUsdc: totalRewardUsdc,
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
