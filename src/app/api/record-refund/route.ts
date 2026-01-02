import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { validateAuth, validateFidMatch } from "~/lib/auth";
import { verifyRefundTransaction, toProjectId } from "~/lib/vault-signer";
import { checkTxHashNotUsed, recordTxHashUsed, verifyOnChainDelta } from "~/lib/transactions";
import { AMOUNT_TOLERANCE_USDC } from "~/lib/constants";

interface RecordRefundRequest {
  user_fid: number;
  tx_hash: string;
  amount: number; // Amount refunded in USDC (for validation)
  idea_id: number; // v2: required - record refund for specific project
}

/**
 * POST /api/record-refund
 *
 * Record a successful refund claim after on-chain transaction.
 * V2: Per-project refund recording - only marks funding for the specific idea.
 *
 * This endpoint:
 * 1. Verifies the tx_hash on-chain with projectId
 * 2. Checks the tx_hash hasn't been used before
 * 3. Verifies on-chain amount matches DB-eligible funding for THIS idea
 * 4. Marks funding records for THIS idea as refunded
 * 5. Updates the specific idea's pool
 * 6. Records tx_hash in history table
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

    const body = (await request.json()) as RecordRefundRequest;

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

    // CRITICAL: Check if this tx_hash has EVER been used for a refund claim
    const txCheck = await checkTxHashNotUsed(body.tx_hash, "refund", body.user_fid);
    if (txCheck.used) {
      return NextResponse.json({ error: txCheck.error }, { status: 409 });
    }

    // Fetch user for claimed_refunds tracking
    const { data: user, error: userFetchError } = await supabase
      .from("users")
      .select("claimed_refunds")
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

    // SECURITY: Verify the refund transaction on-chain with projectId (v2)
    const verification = await verifyRefundTransaction(body.tx_hash, body.user_fid, projectId);
    if (!verification.verified) {
      return NextResponse.json(
        { error: verification.error || "Transaction verification failed" },
        { status: 400 }
      );
    }

    // The on-chain amount is the authoritative amount that was claimed
    const onChainAmountUsdc = verification.amount > 0n
      ? Number(verification.amount) / 1_000_000
      : body.amount;

    // v2: Get funding for THIS specific idea only (not all ideas)
    const { data: ideaFunding, error: fundingError } = await supabase
      .from("funding")
      .select("id, amount")
      .eq("funder_fid", body.user_fid)
      .eq("idea_id", body.idea_id)
      .is("refunded_at", null);

    if (fundingError) {
      console.error("Error fetching funding:", fundingError);
      return NextResponse.json(
        { error: "Failed to fetch funding records" },
        { status: 500 }
      );
    }

    if (!ideaFunding || ideaFunding.length === 0) {
      return NextResponse.json(
        { error: "No eligible funding found for this idea" },
        { status: 400 }
      );
    }

    // Calculate total eligible funding for this idea
    const totalEligibleUsdc = ideaFunding.reduce((sum, f) => sum + Number(f.amount), 0);

    // SECURITY: Verify on-chain amount matches eligible funding for THIS idea
    const deltaCheck = verifyOnChainDelta(verification.amount, totalEligibleUsdc, AMOUNT_TOLERANCE_USDC);
    if (!deltaCheck.matches) {
      console.error(
        `On-chain amount mismatch: on-chain=${deltaCheck.onChainUsdc}, eligible=${totalEligibleUsdc}`
      );
      return NextResponse.json(
        {
          error: "On-chain refund amount does not match eligible funding",
          on_chain_amount: deltaCheck.onChainUsdc,
          eligible_total: totalEligibleUsdc,
        },
        { status: 400 }
      );
    }

    const fundingIds = ideaFunding.map((f) => f.id);

    // FIRST: Record the tx_hash in history table BEFORE making any changes
    const txRecord = await recordTxHashUsed(body.tx_hash, "refund", body.user_fid, onChainAmountUsdc);
    if (!txRecord.success) {
      return NextResponse.json(
        { error: txRecord.error },
        { status: txRecord.alreadyUsed ? 409 : 500 }
      );
    }

    // Mark funding for THIS idea as refunded
    const { error: updateFundingError } = await supabase
      .from("funding")
      .update({
        refunded_at: new Date().toISOString(),
      })
      .in("id", fundingIds);

    if (updateFundingError) {
      console.error("Error updating funding records:", updateFundingError);
      // Don't return error - tx_hash is already recorded
    }

    // Update THIS idea's pool
    const { error: updateIdeaError } = await supabase
      .rpc("decrement_pool", { idea_id_param: body.idea_id, amount_param: totalEligibleUsdc });

    if (updateIdeaError) {
      console.error(`Error updating idea ${body.idea_id} pool:`, updateIdeaError);
    }

    // Update user's claimed_refunds total
    const newClaimedRefunds = (Number(user?.claimed_refunds) || 0) + onChainAmountUsdc;
    const { error: updateUserError } = await supabase
      .from("users")
      .update({
        claimed_refunds: newClaimedRefunds,
        last_refund_tx_hash: body.tx_hash,
      })
      .eq("fid", body.user_fid);

    if (updateUserError) {
      console.error("Error updating user:", updateUserError);
    }

    return NextResponse.json({
      success: true,
      idea_id: body.idea_id,
      project_id: projectId,
      refunded_funding_count: fundingIds.length,
      total_refunded: totalEligibleUsdc,
      verified_amount: onChainAmountUsdc,
      tx_hash: body.tx_hash,
    });
  } catch (error) {
    console.error("Record refund error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
