import { createServerClient } from "~/lib/supabase";
import { verifyRefundTransaction, toProjectId } from "~/lib/vault-signer";
import { checkTxHashNotUsed, recordTxHashUsed, verifyOnChainDelta } from "~/lib/transactions";
import { AMOUNT_TOLERANCE_USDC } from "~/lib/constants";

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
 * V2: Per-project refund recording - only marks funding for the specific idea.
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

  // v2: Get funding for THIS specific idea only (not all ideas)
  const { data: ideaFunding, error: fundingError } = await supabase
    .from("funding")
    .select("id, amount")
    .eq("funder_fid", user_fid)
    .eq("idea_id", idea_id)
    .is("refunded_at", null);

  if (fundingError) {
    console.error("Error fetching funding:", fundingError);
    return { success: false, error: "Failed to fetch funding records", status: 500 };
  }

  if (!ideaFunding || ideaFunding.length === 0) {
    return { success: false, error: "No eligible funding found for this idea", status: 400 };
  }

  // Calculate total eligible funding for this idea
  const totalEligibleUsdc = ideaFunding.reduce((sum, f) => sum + Number(f.amount), 0);

  // SECURITY: Verify on-chain amount matches eligible funding for THIS idea
  const deltaCheck = verifyOnChainDelta(verification.amount, totalEligibleUsdc, AMOUNT_TOLERANCE_USDC);
  if (!deltaCheck.matches) {
    console.error(
      `On-chain amount mismatch: on-chain=${deltaCheck.onChainUsdc}, eligible=${totalEligibleUsdc}`
    );
    return {
      success: false,
      error: `On-chain refund amount (${deltaCheck.onChainUsdc}) does not match eligible funding (${totalEligibleUsdc})`,
      status: 400,
    };
  }

  const fundingIds = ideaFunding.map((f) => f.id);

  // FIRST: Record the tx_hash in history table BEFORE making any changes
  const txRecord = await recordTxHashUsed(tx_hash, "refund", user_fid, onChainAmountUsdc);
  if (!txRecord.success) {
    return { success: false, error: txRecord.error, status: txRecord.alreadyUsed ? 409 : 500 };
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
    .rpc("decrement_pool", { idea_id_param: idea_id, amount_param: totalEligibleUsdc });

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
      total_refunded: totalEligibleUsdc,
      verified_amount: onChainAmountUsdc,
      tx_hash,
    },
  };
}
