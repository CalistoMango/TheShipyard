/**
 * Refund Eligibility Utilities
 *
 * Centralized logic for checking if an idea is eligible for refunds.
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

/**
 * Check if an idea is eligible for refunds.
 *
 * An idea is refund-eligible when:
 * 1. Status is "open"
 * 2. Inactive for REFUND_DELAY_DAYS or more
 *
 * @param idea - Object with status, updated_at, and created_at fields
 * @returns RefundEligibility with eligible status and timing info
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
