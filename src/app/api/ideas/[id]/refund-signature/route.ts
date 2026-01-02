import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { signRefundClaim, usdcToBaseUnits, getLastClaimedRefund } from "~/lib/vault-signer";
import { validateAuth, validateFidMatch } from "~/lib/auth";
import { REFUND_DELAY_DAYS } from "~/lib/constants";
import { checkRefundEligibility } from "~/lib/refund";
import { parseId } from "~/lib/utils";

interface RefundSignatureRequest {
  user_fid: number;
  recipient: string; // wallet address
}

/**
 * POST /api/ideas/[id]/refund-signature
 *
 * Get a signed authorization to claim refunds for a specific idea.
 * This endpoint calculates the refund amount for the user's funding
 * on THIS specific idea only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = parseId(id, "idea ID");
  if (!parsed.valid) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const ideaId = parsed.id;

  try {
    // Validate authentication
    const auth = await validateAuth(request);
    if (!auth.authenticated || !auth.fid) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as RefundSignatureRequest;

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

    // Check if idea exists and is eligible for refund
    // Ideas are refund-eligible when they are "open" and inactive for 30+ days
    const { data: idea, error: ideaError } = await supabase
      .from("ideas")
      .select("id, status, updated_at, created_at")
      .eq("id", ideaId)
      .single();

    if (ideaError || !idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    // Check if idea is refund-eligible using centralized function
    const refundEligibility = checkRefundEligibility({
      status: idea.status,
      updated_at: idea.updated_at,
      created_at: idea.created_at,
    });

    if (idea.status !== "open") {
      return NextResponse.json(
        { error: "Refunds are only available for open ideas" },
        { status: 400 }
      );
    }

    // REFUND_DELAY_DAYS is 0 when SKIP_REFUND_DELAY is set on testnet
    if (!refundEligibility.eligible) {
      return NextResponse.json(
        {
          error: `Refunds are only available after ${REFUND_DELAY_DAYS} days of inactivity`,
          days_since_activity: Math.floor(refundEligibility.daysSinceActivity),
          days_remaining: refundEligibility.daysUntilRefund,
        },
        { status: 400 }
      );
    }

    // Get funding by this user for THIS specific idea only
    // IMPORTANT: Exclude already-refunded funding records
    const { data: eligibleFunding, error: fundingError } = await supabase
      .from("funding")
      .select("id, amount")
      .eq("funder_fid", body.user_fid)
      .eq("idea_id", ideaId) // Only this idea
      .is("refunded_at", null); // Only un-refunded

    if (fundingError) {
      console.error("Error fetching funding:", fundingError);
      return NextResponse.json(
        { error: "Failed to fetch funding history" },
        { status: 500 }
      );
    }

    // Calculate refund amount for this idea
    const thisIdeaRefundUsdc = (eligibleFunding || []).reduce(
      (sum, f) => sum + Number(f.amount),
      0
    );

    if (thisIdeaRefundUsdc <= 0) {
      return NextResponse.json(
        { error: "No refund available for this user on this idea" },
        { status: 400 }
      );
    }

    // SECURITY: To prevent double-claims if record-refund is skipped,
    // calculate TOTAL eligible refunds across ALL refund-eligible ideas
    // and compare against on-chain lastClaimedRefund
    const { data: allEligibleFunding, error: allFundingError } = await supabase
      .from("funding")
      .select("amount, ideas!inner(status, updated_at, created_at)")
      .eq("funder_fid", body.user_fid)
      .is("refunded_at", null)
      .eq("ideas.status", "open");

    if (allFundingError) {
      console.error("Error fetching all funding:", allFundingError);
      return NextResponse.json(
        { error: "Failed to calculate total eligible refunds" },
        { status: 500 }
      );
    }

    // Filter to only ideas that are refund-eligible using centralized function
    const totalEligibleUsdc = (allEligibleFunding || []).reduce((sum, f) => {
      const ideaInfo = f.ideas as unknown as { status: string; updated_at: string; created_at: string };
      const { eligible } = checkRefundEligibility({
        status: ideaInfo.status,
        updated_at: ideaInfo.updated_at,
        created_at: ideaInfo.created_at,
      });
      if (eligible) {
        return sum + Number(f.amount);
      }
      return sum;
    }, 0);

    // Convert to base units
    const totalEligibleBaseUnits = usdcToBaseUnits(totalEligibleUsdc);

    // Query on-chain state for cumulative amount already claimed
    const lastClaimed = await getLastClaimedRefund(BigInt(body.user_fid));

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
        { error: "No new refunds available - already claimed on-chain" },
        { status: 400 }
      );
    }

    // Sign the claim with the cumulative amount (last claimed + new)
    const signedClaim = await signRefundClaim({
      fid: BigInt(body.user_fid),
      recipientAddress: body.recipient,
      cumulativeAmount,
    });

    return NextResponse.json({
      success: true,
      fid: body.user_fid,
      recipient: body.recipient,
      ideaId,
      cumulativeAmount: signedClaim.cumAmt,
      deltaAmount: deltaAmount.toString(),
      deltaAmountUsdc: Number(deltaAmount) / 1_000_000,
      thisIdeaRefundUsdc,
      deadline: signedClaim.deadline,
      signature: signedClaim.signature,
    });
  } catch (error) {
    console.error("Refund signature error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
