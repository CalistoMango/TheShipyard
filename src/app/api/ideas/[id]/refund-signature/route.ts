import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { signRefundClaim, usdcToBaseUnits } from "~/lib/vault-signer";

interface RefundSignatureRequest {
  user_fid: number;
  recipient: string; // wallet address
}

/**
 * POST /api/ideas/[id]/refund-signature
 *
 * Get a signed authorization to claim refunds for a specific idea.
 * This endpoint calculates the cumulative refund amount for the user
 * and signs it for the on-chain claim.
 *
 * Note: The cumulative amount includes ALL refund-eligible funding by this FID,
 * not just for this specific idea. The contract tracks by FID globally.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ideaId = parseInt(id, 10);

  if (isNaN(ideaId)) {
    return NextResponse.json({ error: "Invalid idea ID" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as RefundSignatureRequest;

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

    // Check if idea is refund-eligible (30+ days of inactivity)
    const lastActivity = new Date(idea.updated_at || idea.created_at);
    const daysSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);

    // Allow bypassing time check on testnet for testing
    const skipTimeCheck = process.env.SKIP_REFUND_DELAY === "true" &&
                          process.env.NEXT_PUBLIC_CHAIN_ID === "84532";

    if (idea.status !== "open") {
      return NextResponse.json(
        { error: "Refunds are only available for open ideas" },
        { status: 400 }
      );
    }

    if (daysSinceActivity < 30 && !skipTimeCheck) {
      return NextResponse.json(
        {
          error: "Refunds are only available after 30 days of inactivity",
          days_since_activity: Math.floor(daysSinceActivity),
          days_remaining: Math.ceil(30 - daysSinceActivity),
        },
        { status: 400 }
      );
    }

    // Get ALL funding by this user for refund-eligible ideas
    // The contract uses cumulative amounts by FID, so we sum up all eligible refunds
    const { data: eligibleFunding, error: fundingError } = await supabase
      .from("funding")
      .select(`
        id,
        amount,
        idea_id,
        ideas!inner(status, updated_at, created_at)
      `)
      .eq("funder_fid", body.user_fid);

    if (fundingError) {
      console.error("Error fetching funding:", fundingError);
      return NextResponse.json(
        { error: "Failed to fetch funding history" },
        { status: 500 }
      );
    }

    // Filter to only refund-eligible ideas (open + 30+ days inactive)
    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    const refundEligible = (eligibleFunding || []).filter((f) => {
      const ideaInfo = f.ideas as unknown as {
        status: string;
        updated_at: string | null;
        created_at: string;
      };
      if (ideaInfo.status !== "open") return false;

      // Skip time check on testnet if flag is set
      if (skipTimeCheck) return true;

      const lastUpdate = new Date(ideaInfo.updated_at || ideaInfo.created_at);
      return now - lastUpdate.getTime() >= THIRTY_DAYS_MS;
    });

    // Calculate cumulative refund amount
    const cumulativeRefundUsdc = refundEligible.reduce(
      (sum, f) => sum + Number(f.amount),
      0
    );

    if (cumulativeRefundUsdc <= 0) {
      return NextResponse.json(
        { error: "No refund available for this user" },
        { status: 400 }
      );
    }

    // Convert to USDC base units (6 decimals)
    const cumulativeAmount = usdcToBaseUnits(cumulativeRefundUsdc);

    // Sign the claim
    const signedClaim = await signRefundClaim({
      fid: BigInt(body.user_fid),
      recipientAddress: body.recipient,
      cumulativeAmount,
    });

    return NextResponse.json({
      success: true,
      fid: body.user_fid,
      recipient: body.recipient,
      cumulativeAmount: signedClaim.cumAmt,
      cumulativeAmountUsdc: cumulativeRefundUsdc,
      deadline: signedClaim.deadline,
      signature: signedClaim.signature,
      // Include breakdown for transparency
      eligibleIdeas: refundEligible.map((f) => ({
        idea_id: f.idea_id,
        amount: Number(f.amount),
      })),
    });
  } catch (error) {
    console.error("Refund signature error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
