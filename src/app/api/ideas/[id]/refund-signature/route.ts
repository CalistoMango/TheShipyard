import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { signRefundClaim, usdcToBaseUnits } from "~/lib/vault-signer";
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

    // Convert to base units - this is what the user is entitled to for THIS idea
    const cumulativeAmount = usdcToBaseUnits(thisIdeaRefundUsdc);

    // Sign the claim with the cumulative amount from the database
    // The contract will:
    // 1. Verify cumAmt >= lastClaimedRefund (can't go backwards)
    // 2. Pay out delta = cumAmt - lastClaimedRefund
    // 3. Update lastClaimedRefund = cumAmt
    // If delta is 0, the contract call will succeed but transfer nothing
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
      cumulativeAmountUsdc: thisIdeaRefundUsdc,
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
