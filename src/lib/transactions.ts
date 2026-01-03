/**
 * Transaction Utilities
 *
 * Centralized logic for transaction hash validation and replay prevention.
 */

import { createServerClient } from "./supabase";

export type ClaimType = "refund" | "reward";

export interface TxHashCheckResult {
  used: boolean;
  error?: string;
  dbError?: boolean; // True if check failed due to DB error (fail closed)
}

/**
 * Check if a transaction hash has already been used for a claim.
 *
 * Checks both the used_claim_tx history table and legacy per-user/per-idea fields.
 *
 * @param txHash - The transaction hash to check
 * @param claimType - Type of claim ("refund" or "reward")
 * @param userFid - User FID for legacy field check
 * @returns Object indicating if the tx_hash was already used
 */
export async function checkTxHashNotUsed(
  txHash: string,
  claimType: ClaimType,
  userFid: number
): Promise<TxHashCheckResult> {
  const supabase = createServerClient();

  // Check the history table first
  // SECURITY: Fail closed - if we can't verify, reject the claim
  const { data: existingTx, error: historyError } = await supabase
    .from("used_claim_tx")
    .select("tx_hash")
    .eq("tx_hash", txHash)
    .eq("claim_type", claimType)
    .single();

  // Fail closed: if DB query fails (except "not found"), reject to prevent bypass
  if (historyError && historyError.code !== "PGRST116") {
    console.error("Error checking tx_hash history:", historyError);
    return {
      used: true,
      dbError: true,
      error: "Unable to verify transaction status. Please try again.",
    };
  }

  if (existingTx) {
    return { used: true, error: `${claimType === "reward" ? "Reward" : "Refund"} transaction has already been recorded` };
  }

  // Legacy checks
  if (claimType === "reward") {
    // Check if any idea has this tx_hash
    const { data: existingIdeaClaim } = await supabase
      .from("ideas")
      .select("id")
      .eq("reward_claim_tx_hash", txHash)
      .limit(1)
      .single();

    if (existingIdeaClaim) {
      return { used: true, error: "Reward transaction has already been recorded" };
    }

    // Check user's last_reward_tx_hash
    const { data: user } = await supabase
      .from("users")
      .select("last_reward_tx_hash")
      .eq("fid", userFid)
      .single();

    if (user?.last_reward_tx_hash === txHash) {
      return { used: true, error: "Reward transaction has already been recorded" };
    }
  } else {
    // Refund: check user's last_refund_tx_hash
    const { data: user } = await supabase
      .from("users")
      .select("last_refund_tx_hash")
      .eq("fid", userFid)
      .single();

    if (user?.last_refund_tx_hash === txHash) {
      return { used: true, error: "Refund transaction has already been recorded" };
    }
  }

  return { used: false };
}

/**
 * Record a transaction hash as used.
 *
 * @param txHash - The transaction hash to record
 * @param claimType - Type of claim
 * @param userFid - User FID who claimed
 * @param amount - Amount claimed in USDC
 * @param ideaId - Optional idea ID for per-project tracking
 * @returns Success status and any error
 */
export async function recordTxHashUsed(
  txHash: string,
  claimType: ClaimType,
  userFid: number,
  amount: number,
  ideaId?: number
): Promise<{ success: boolean; alreadyUsed?: boolean; error?: string }> {
  const supabase = createServerClient();

  const { error: insertTxError } = await supabase
    .from("used_claim_tx")
    .insert({
      tx_hash: txHash,
      user_fid: userFid,
      claim_type: claimType,
      amount,
      ...(ideaId !== undefined && { idea_id: ideaId }),
    });

  if (insertTxError) {
    // If insert fails due to unique constraint, tx was already used
    if (insertTxError.code === "23505") {
      return {
        success: false,
        alreadyUsed: true,
        error: `${claimType === "reward" ? "Reward" : "Refund"} transaction has already been recorded`,
      };
    }
    console.error("Error recording tx_hash:", insertTxError);
    return { success: false, error: "Failed to record transaction" };
  }

  return { success: true };
}

/**
 * Verify on-chain amount matches expected amount with tolerance.
 *
 * @param onChainAmount - Amount from on-chain verification (in base units, bigint)
 * @param expectedAmountUsdc - Expected amount in USDC
 * @param toleranceUsdc - Allowed tolerance in USDC (default 0.01)
 * @returns Object with match status and converted amounts
 */
export function verifyOnChainDelta(
  onChainAmount: bigint,
  expectedAmountUsdc: number,
  toleranceUsdc: number = 0.01
): { matches: boolean; onChainUsdc: number; difference: number } {
  // Convert from base units to USDC
  const onChainUsdc = onChainAmount > 0n
    ? Number(onChainAmount) / 1_000_000
    : 0;

  const difference = Math.abs(onChainUsdc - expectedAmountUsdc);
  const matches = onChainAmount === 0n || difference <= toleranceUsdc;

  return { matches, onChainUsdc, difference };
}
