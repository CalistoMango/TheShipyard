import { createServerClient } from "~/lib/supabase";
import { verifyRefundTransaction, toProjectId } from "~/lib/vault-signer";
import { checkTxHashNotUsed, recordTxHashUsed } from "~/lib/transactions";

export interface RecordRefundParams {
  user_fid: number;
  tx_hash: string;
  amount: number;
  idea_id: number;
}

export interface RecordRefundResult {
  success: boolean;
  error?: string;
  status?: number;
  data?: {
    idea_id: number;
    project_id: string;
    refunded_funding_count: number;
    total_refunded: number;
    verified_amount: number;
    tx_hash: string;
  };
}

/**
 * Core logic for recording a refund claim.
 * V3: Per-project refund recording with cumulative claims.
 * The on-chain event emits the delta (amount transferred), not cumulative.
 * We verify the delta matches the DB-eligible funding for this idea.
 */
export async function recordRefund(params: RecordRefundParams): Promise<RecordRefundResult> {
  const { user_fid, tx_hash, amount, idea_id } = params;

  // Validate inputs
  if (!user_fid) {
    return { success: false, error: "Missing required field: user_fid", status: 400 };
  }
  if (!tx_hash || !tx_hash.startsWith("0x")) {
    return { success: false, error: "Missing or invalid tx_hash", status: 400 };
  }
  if (!amount || amount <= 0) {
    return { success: false, error: "Missing or invalid amount", status: 400 };
  }
  if (!idea_id) {
    return { success: false, error: "Missing required field: idea_id", status: 400 };
  }

  const supabase = createServerClient();

  // CRITICAL: Check if this tx_hash has EVER been used for a refund claim
  const txCheck = await checkTxHashNotUsed(tx_hash, "refund", user_fid);
  if (txCheck.used) {
    return { success: false, error: txCheck.error, status: 409 };
  }

  // Fetch user for claimed_refunds tracking
  const { data: user, error: userFetchError } = await supabase
    .from("users")
    .select("claimed_refunds")
    .eq("fid", user_fid)
    .single();

  if (userFetchError && userFetchError.code !== "PGRST116") {
    console.error("Error fetching user:", userFetchError);
    return { success: false, error: "Failed to fetch user", status: 500 };
  }

  // v2: Convert idea ID to projectId for on-chain verification
  const projectId = toProjectId(idea_id);

  // SECURITY: Verify the refund transaction on-chain with projectId (v2)
  const verification = await verifyRefundTransaction(tx_hash, user_fid, projectId);
  if (!verification.verified) {
    return { success: false, error: verification.error || "Transaction verification failed", status: 400 };
  }

  // The on-chain amount is the authoritative amount that was claimed
  const onChainAmountUsdc = verification.amount > 0n
    ? Number(verification.amount) / 1_000_000
    : amount;

  // V3: Get ALL funding for this idea (including already-refunded)
  // On-chain state is authoritative - if tx succeeded, we trust the delta
  const { data: allFunding, error: fundingError } = await supabase
    .from("funding")
    .select("id, amount, refunded_at")
    .eq("funder_fid", user_fid)
    .eq("idea_id", idea_id);

  if (fundingError) {
    console.error("Error fetching funding:", fundingError);
    return { success: false, error: "Failed to fetch funding records", status: 500 };
  }

  if (!allFunding || allFunding.length === 0) {
    return { success: false, error: "No funding found for this user on this idea", status: 400 };
  }

  // Separate into refunded and unrefunded
  const unrefundedFunding = allFunding.filter((f) => !f.refunded_at);

  // V3 SECURITY: The on-chain delta should be <= total unrefunded
  // But we're lenient: if on-chain succeeded, it's valid even if DB is out of sync
  // The signature endpoint already verified cumAmt = totalEverFunded
  // So delta = cumAmt - onChainClaimed, which is always <= totalUnrefunded if DB is in sync
  //
  // If DB is OUT of sync (prior refund succeeded but DB not updated):
  // - onChainAmountUsdc will be smaller than totalUnrefundedUsdc
  // - That's fine - we mark as much as we can as refunded
  //
  // Key insight: on-chain tx is authoritative. If it succeeded, record it.
  if (verification.amount === 0n) {
    // No delta means nothing new was claimed - shouldn't happen if tx succeeded
    console.warn("On-chain refund amount is 0, but tx was verified");
  }

  // Only mark unrefunded funding as refunded UP TO the on-chain delta amount
  // This prevents marking new funding (added after signature) as refunded
  // IMPORTANT: Only mark rows that fit entirely within the delta to avoid over-marking
  let remainingToMark = onChainAmountUsdc;
  const fundingIdsToMark: number[] = [];
  let markedAmount = 0;
  console.log(`[record-refund] onChainAmountUsdc=${onChainAmountUsdc}, unrefundedFunding.length=${unrefundedFunding.length}`);
  for (const f of unrefundedFunding) {
    const fundingAmount = Number(f.amount);
    // Only include if this row fits entirely within remaining delta
    if (fundingAmount > remainingToMark) {
      console.log(`[record-refund] Skipping funding id=${f.id}, amount=${fundingAmount} > remaining=${remainingToMark}`);
      continue;
    }
    console.log(`[record-refund] Adding funding id=${f.id}, amount=${fundingAmount}`);
    fundingIdsToMark.push(f.id);
    remainingToMark -= fundingAmount;
    markedAmount += fundingAmount;
  }
  const fundingIds = fundingIdsToMark;

  // Warn if we couldn't mark all of the on-chain delta (requires manual reconciliation)
  if (remainingToMark > 0.01) { // Allow small rounding tolerance
    console.warn(`[record-refund] Could not mark full delta: onChain=${onChainAmountUsdc}, marked=${markedAmount}, remaining=${remainingToMark}. May need manual reconciliation.`);
  }
  console.log(`[record-refund] fundingIds to mark: ${JSON.stringify(fundingIds)}`);

  // FIRST: Record the tx_hash in history table BEFORE making any changes
  const txRecord = await recordTxHashUsed(tx_hash, "refund", user_fid, onChainAmountUsdc, idea_id);
  if (!txRecord.success) {
    return { success: false, error: txRecord.error, status: txRecord.alreadyUsed ? 409 : 500 };
  }

  // Mark funding for THIS idea as refunded
  // Use RPC to bypass audit trigger that blocks direct updates
  if (fundingIds.length > 0) {
    const { error: updateFundingError } = await supabase
      .rpc("mark_funding_refunded", { funding_ids: fundingIds });

    if (updateFundingError) {
      // Fallback to direct update if RPC doesn't exist yet
      console.error("Error with RPC mark_funding_refunded, trying direct update:", updateFundingError);
      const { error: directUpdateError } = await supabase
        .from("funding")
        .update({ refunded_at: new Date().toISOString() })
        .in("id", fundingIds);

      if (directUpdateError) {
        console.error("Direct update also failed:", directUpdateError);
        // Don't return error - tx_hash is already recorded, on-chain is authoritative
      } else {
        console.log(`[record-refund] Successfully marked ${fundingIds.length} funding records as refunded (direct)`);
      }
    } else {
      console.log(`[record-refund] Successfully marked ${fundingIds.length} funding records as refunded (RPC)`);
    }
  } else {
    console.warn("[record-refund] No funding IDs to mark as refunded - this may indicate a DB sync issue");
  }

  // Update THIS idea's pool - use on-chain amount (authoritative)
  const { error: updateIdeaError } = await supabase
    .rpc("decrement_pool", { idea_id_param: idea_id, amount_param: onChainAmountUsdc });

  if (updateIdeaError) {
    console.error(`Error updating idea ${idea_id} pool:`, updateIdeaError);
  }

  // Update user's claimed_refunds total
  const newClaimedRefunds = (Number(user?.claimed_refunds) || 0) + onChainAmountUsdc;
  const { error: updateUserError } = await supabase
    .from("users")
    .update({
      claimed_refunds: newClaimedRefunds,
      last_refund_tx_hash: tx_hash,
    })
    .eq("fid", user_fid);

  if (updateUserError) {
    console.error("Error updating user:", updateUserError);
  }

  return {
    success: true,
    data: {
      idea_id,
      project_id: projectId,
      refunded_funding_count: fundingIds.length,
      total_refunded: onChainAmountUsdc, // Use on-chain amount (authoritative)
      verified_amount: onChainAmountUsdc,
      tx_hash,
    },
  };
}
