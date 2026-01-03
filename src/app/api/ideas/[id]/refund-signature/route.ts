import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { signRefundClaim, usdcToBaseUnits, toProjectId, getRefundClaimed } from "~/lib/vault-signer";
import { validateAuth, validateFidMatch } from "~/lib/auth";
import { REFUND_DELAY_DAYS } from "~/lib/constants";
import { checkUserRefundEligibility } from "~/lib/refund";
import { parseId } from "~/lib/utils";

interface RefundSignatureRequest {
  user_fid: number;
  recipient: string; // wallet address
}

/**
 * POST /api/ideas/[id]/refund-signature
 *
 * V3: Get a signed authorization for cumulative refund claim.
 * Backend calculates: cumAmt = onChainClaimed + eligibleRefund
 * Contract pays: delta = cumAmt - onChainClaimed
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

    // Check if idea exists
    const { data: idea, error: ideaError } = await supabase
      .from("ideas")
      .select("id, status")
      .eq("id", ideaId)
      .single();

    if (ideaError || !idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    if (idea.status !== "open" && idea.status !== "already_exists") {
      return NextResponse.json(
        { error: "Refunds are only available for open or already-exists ideas" },
        { status: 400 }
      );
    }

    // V2: Get user's funding for this idea to check per-user eligibility
    const { data: userFunding, error: fundingError } = await supabase
      .from("funding")
      .select("id, amount, created_at, refunded_at")
      .eq("funder_fid", body.user_fid)
      .eq("idea_id", ideaId);

    if (fundingError) {
      console.error("Error fetching funding:", fundingError);
      return NextResponse.json(
        { error: "Failed to fetch funding history" },
        { status: 500 }
      );
    }

    // V2: Check per-user refund eligibility based on their LATEST funding
    // Each user's 30-day clock is independent - based on when THEY last funded
    const refundEligibility = checkUserRefundEligibility(
      idea.status,
      userFunding || []
    );

    if (refundEligibility.totalUnrefunded <= 0) {
      // Distinguish between "never funded" and "all already refunded"
      const hasPriorFunding = (userFunding?.length || 0) > 0;
      const errorMessage = hasPriorFunding
        ? "All your funding for this idea has already been refunded"
        : "No funding found for this user on this idea";
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    // REFUND_DELAY_DAYS is 0 when SKIP_REFUND_DELAY is set on testnet
    if (!refundEligibility.eligible) {
      return NextResponse.json(
        {
          error: `Refunds are only available ${REFUND_DELAY_DAYS} days after your last funding`,
          days_since_last_funding: Math.floor(refundEligibility.daysSinceLastFunding),
          days_remaining: refundEligibility.daysUntilRefund,
        },
        { status: 400 }
      );
    }

    // Convert idea ID to bytes32 projectId for v3 contract
    const projectId = toProjectId(ideaId);

    // V3: Get on-chain cumulative claimed amount FIRST
    // CRITICAL: If RPC fails, we must NOT proceed with potentially stale data
    let onChainClaimed: bigint;
    try {
      onChainClaimed = await getRefundClaimed(projectId, BigInt(body.user_fid));
    } catch (error) {
      console.error("Failed to read on-chain claimed amount:", error);
      return NextResponse.json(
        { error: "Failed to verify on-chain state" },
        { status: 503 }
      );
    }

    // Calculate total ever funded for this idea (including already-refunded)
    const totalEverFundedUsdc = (userFunding || []).reduce(
      (sum, f) => sum + Number(f.amount),
      0
    );

    // Convert to base units
    const totalEverFunded = usdcToBaseUnits(totalEverFundedUsdc);

    // V3 SECURITY: The cumAmt to sign is the total ever funded
    // Contract will pay: min(cumAmt - onChainClaimed, cumAmt)
    // If user already claimed everything, delta = 0, contract rejects "Nothing new to claim"
    //
    // This is safe because:
    // - cumAmt is based on actual funding records (can't inflate)
    // - Contract only pays the delta since last claim
    // - Even if DB refunded_at is out of sync, on-chain state prevents double-pay
    const cumAmt = totalEverFunded;

    // Check if there's anything new to claim
    if (cumAmt <= onChainClaimed) {
      return NextResponse.json(
        { error: "No refund available - all funding already claimed" },
        { status: 400 }
      );
    }

    // Calculate actual amount that will be transferred (for UI display)
    const deltaAmount = cumAmt - onChainClaimed;
    const deltaUsdc = Number(deltaAmount) / 1_000_000;

    const signedClaim = await signRefundClaim({
      projectId,
      fid: BigInt(body.user_fid),
      recipientAddress: body.recipient,
      cumAmt,
    });

    return NextResponse.json({
      success: true,
      fid: body.user_fid,
      recipient: body.recipient,
      ideaId,
      projectId: signedClaim.projectId,
      cumAmt: signedClaim.cumAmt,
      amountUsdc: deltaUsdc, // The delta that will be transferred
      totalEverFunded: totalEverFundedUsdc,
      onChainClaimed: onChainClaimed.toString(),
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
