/**
 * Refund Eligibility Utilities
 *
 * Centralized logic for checking refund eligibility.
 *
 * V2: Per-user eligibility based on their latest funding for the idea.
 * Each user's 30-day clock is independent - based on when THEY last funded,
 * not when the idea was last active.
 */

import { REFUND_DELAY_DAYS } from "./constants";

export interface IdeaRefundInfo {
  status: string;
  updated_at: string | null;
  created_at: string;
}

export interface RefundEligibility {
  eligible: boolean;
  daysSinceActivity: number;
  daysUntilRefund: number;
}

export interface UserRefundEligibility {
  eligible: boolean;
  daysSinceLastFunding: number;
  daysUntilRefund: number;
  latestFundingAt: Date | null;
  totalUnrefunded: number;
}

/**
 * @deprecated Use checkUserRefundEligibility instead.
 * This checks idea-level activity which is no longer used for refund eligibility.
 */
export function checkRefundEligibility(idea: IdeaRefundInfo): RefundEligibility {
  if (idea.status !== "open") {
    return { eligible: false, daysSinceActivity: 0, daysUntilRefund: 0 };
  }

  const lastActivity = new Date(idea.updated_at || idea.created_at);
  const daysSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
  const eligible = daysSinceActivity >= REFUND_DELAY_DAYS;
  const daysUntilRefund = Math.max(0, Math.ceil(REFUND_DELAY_DAYS - daysSinceActivity));

  return { eligible, daysSinceActivity, daysUntilRefund };
}

export interface FundingRecord {
  id: string;
  amount: number;
  created_at: string;
  refunded_at: string | null;
}

/**
 * Check if a user is eligible for refund on a specific idea.
 *
 * V2: Per-user eligibility based on their LATEST unrefunded funding.
 * - Each user's 30-day clock is independent
 * - Based on when THEY last funded, not idea activity
 * - All unrefunded funding becomes eligible together (no partial refunds)
 *
 * @param ideaStatus - The idea's current status (must be "open")
 * @param userFunding - Array of user's funding records for this idea
 * @returns UserRefundEligibility with timing info
 */
export function checkUserRefundEligibility(
  ideaStatus: string,
  userFunding: FundingRecord[]
): UserRefundEligibility {
  // Idea must be open for refunds
  if (ideaStatus !== "open") {
    return {
      eligible: false,
      daysSinceLastFunding: 0,
      daysUntilRefund: 0,
      latestFundingAt: null,
      totalUnrefunded: 0,
    };
  }

  // Filter to unrefunded funding only
  const unrefundedFunding = userFunding.filter((f) => !f.refunded_at);

  if (unrefundedFunding.length === 0) {
    return {
      eligible: false,
      daysSinceLastFunding: 0,
      daysUntilRefund: 0,
      latestFundingAt: null,
      totalUnrefunded: 0,
    };
  }

  // Find the latest (most recent) unrefunded funding
  const latestFundingAt = unrefundedFunding.reduce((latest, f) => {
    const fundingDate = new Date(f.created_at);
    return fundingDate > latest ? fundingDate : latest;
  }, new Date(0));

  // Calculate total unrefunded amount
  const totalUnrefunded = unrefundedFunding.reduce(
    (sum, f) => sum + Number(f.amount),
    0
  );

  // Check if 30 days have passed since the latest funding
  const daysSinceLastFunding = (Date.now() - latestFundingAt.getTime()) / (1000 * 60 * 60 * 24);
  const eligible = daysSinceLastFunding >= REFUND_DELAY_DAYS;
  const daysUntilRefund = Math.max(0, Math.ceil(REFUND_DELAY_DAYS - daysSinceLastFunding));

  return {
    eligible,
    daysSinceLastFunding,
    daysUntilRefund,
    latestFundingAt,
    totalUnrefunded,
  };
}
