import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { validateAuth, validateFidMatch } from "~/lib/auth";
import { verifyRefundTransaction } from "~/lib/vault-signer";
import { checkRefundEligibility } from "~/lib/refund";
import { checkTxHashNotUsed, recordTxHashUsed, verifyOnChainDelta } from "~/lib/transactions";
import { AMOUNT_TOLERANCE_USDC } from "~/lib/constants";

interface RecordRefundRequest {
  user_fid: number;
  tx_hash: string;
  amount: number; // Amount refunded in USDC (for validation)
}

/**
 * POST /api/record-refund
 *
 * Record a successful refund claim after on-chain transaction.
 * This is the GLOBAL endpoint that handles cumulative refunds across ALL ideas.
 *
 * On-chain, refunds are cumulative - a single transaction claims all eligible
 * refunds. This endpoint reconciles that by:
 * 1. Verifying the tx_hash on-chain and extracting the delta amount
 * 2. Checking the tx_hash hasn't been used before (against history table)
 * 3. Verifying on-chain delta matches DB-eligible funding total
 * 4. Marking funding records as refunded
 * 5. Updating all affected idea pools
 * 6. Recording tx_hash in history table to prevent ANY future replay
 *
 * SECURITY: Requires authentication and FID must match.
 * CRITICAL: tx_hash is checked against a history table, not just last_tx_hash.
 * CRITICAL: On-chain delta must match eligible funding to prevent drift.
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

    // SECURITY: Verify the refund transaction on-chain before updating DB
    const verification = await verifyRefundTransaction(body.tx_hash, body.user_fid);
    if (!verification.verified) {
      return NextResponse.json(
        { error: verification.error || "Transaction verification failed" },
        { status: 400 }
      );
    }

    // The on-chain delta is the authoritative amount that was claimed
    const onChainDeltaUsdc = verification.amount > 0n
      ? Number(verification.amount) / 1_000_000
      : body.amount;

    // Get ALL un-refunded funding by this user for refund-eligible ideas
    // An idea is refund-eligible if:
    // 1. Status is "open"
    // 2. Inactive for REFUND_DELAY_DAYS or more
    const { data: allFunding, error: fundingError } = await supabase
      .from("funding")
      .select("id, amount, idea_id, created_at, ideas!inner(id, status, updated_at, created_at, pool)")
      .eq("funder_fid", body.user_fid)
      .is("refunded_at", null)
      .eq("ideas.status", "open")
      .order("created_at", { ascending: true }); // Process oldest funding first

    if (fundingError) {
      console.error("Error fetching funding:", fundingError);
      return NextResponse.json(
        { error: "Failed to fetch funding records" },
        { status: 500 }
      );
    }

    // Filter to only funding from refund-eligible ideas using centralized function
    const eligibleFunding = (allFunding || []).filter((f) => {
      const ideaInfo = f.ideas as unknown as {
        id: number;
        status: string;
        updated_at: string;
        created_at: string;
        pool: number;
      };
      const { eligible } = checkRefundEligibility({
        status: ideaInfo.status,
        updated_at: ideaInfo.updated_at,
        created_at: ideaInfo.created_at,
      });
      return eligible;
    });

    if (eligibleFunding.length === 0) {
      return NextResponse.json(
        { error: "No eligible funding found to mark as refunded" },
        { status: 400 }
      );
    }

    // Calculate total eligible funding
    const totalEligibleUsdc = eligibleFunding.reduce((sum, f) => sum + Number(f.amount), 0);

    // SECURITY: Verify on-chain delta matches eligible funding
    const deltaCheck = verifyOnChainDelta(verification.amount, totalEligibleUsdc, AMOUNT_TOLERANCE_USDC);
    if (!deltaCheck.matches) {
      console.error(
        `On-chain delta mismatch: on-chain=${deltaCheck.onChainUsdc}, eligible=${totalEligibleUsdc}`
      );
      return NextResponse.json(
        {
          error: "On-chain refund amount does not match eligible funding",
          on_chain_delta: deltaCheck.onChainUsdc,
          eligible_total: totalEligibleUsdc,
        },
        { status: 400 }
      );
    }

    // Group funding by idea to update pools correctly
    const fundingByIdea = new Map<number, { ids: string[]; total: number; currentPool: number }>();
    for (const f of eligibleFunding) {
      const ideaInfo = f.ideas as unknown as { id: number; pool: number };
      const existing = fundingByIdea.get(ideaInfo.id) || { ids: [], total: 0, currentPool: ideaInfo.pool };
      existing.ids.push(f.id);
      existing.total += Number(f.amount);
      fundingByIdea.set(ideaInfo.id, existing);
    }

    const totalRefunded = eligibleFunding.reduce((sum, f) => sum + Number(f.amount), 0);
    const allFundingIds = eligibleFunding.map((f) => f.id);

    // FIRST: Record the tx_hash in history table BEFORE making any changes
    // This prevents race conditions where another request could slip through
    const txRecord = await recordTxHashUsed(body.tx_hash, "refund", body.user_fid, onChainDeltaUsdc);
    if (!txRecord.success) {
      return NextResponse.json(
        { error: txRecord.error },
        { status: txRecord.alreadyUsed ? 409 : 500 }
      );
    }

    // Mark all eligible funding as refunded
    const { error: updateFundingError } = await supabase
      .from("funding")
      .update({
        refunded_at: new Date().toISOString(),
      })
      .in("id", allFundingIds);

    if (updateFundingError) {
      console.error("Error updating funding records:", updateFundingError);
      // Don't return error - tx_hash is already recorded, so this is idempotent
    }

    // ATOMIC: Update all affected idea pools using RPC
    const ideaUpdates: { id: number; refunded: number }[] = [];
    for (const [ideaId, data] of fundingByIdea) {
      const { error: updateIdeaError } = await supabase
        .rpc("decrement_pool", { idea_id_param: ideaId, amount_param: data.total });

      if (updateIdeaError) {
        console.error(`Error updating idea ${ideaId} pool:`, updateIdeaError);
      } else {
        ideaUpdates.push({ id: ideaId, refunded: data.total });
      }
    }

    // Update user's claimed_refunds total and last_refund_tx_hash (for backwards compat)
    const newClaimedRefunds = (Number(user?.claimed_refunds) || 0) + onChainDeltaUsdc;
    const { error: updateUserError } = await supabase
      .from("users")
      .update({
        claimed_refunds: newClaimedRefunds,
        last_refund_tx_hash: body.tx_hash,
      })
      .eq("fid", body.user_fid);

    if (updateUserError) {
      console.error("Error updating user:", updateUserError);
      // Don't fail - the tx_hash is already recorded
    }

    return NextResponse.json({
      success: true,
      refunded_funding_count: allFundingIds.length,
      ideas_updated: ideaUpdates.length,
      idea_details: ideaUpdates,
      total_refunded: totalRefunded,
      verified_amount: onChainDeltaUsdc,
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
