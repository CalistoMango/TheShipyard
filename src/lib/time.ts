/**
 * Time Utilities
 *
 * Centralized logic for time calculations (cooldowns, voting windows, etc).
 */

import { VOTING_WINDOW_MS, REJECTION_COOLDOWN_MS } from "./constants";

/**
 * Calculate the end time for a voting window starting now.
 *
 * @returns The vote end date/time
 */
export function calculateVoteEndTime(): Date {
  return new Date(Date.now() + VOTING_WINDOW_MS);
}

/**
 * Calculate remaining time until a deadline.
 *
 * @param endTime - The deadline (Date or timestamp in ms)
 * @param unit - Time unit for the result ("hours" or "minutes")
 * @returns Remaining time in the specified unit (0 if past deadline)
 */
export function calculateTimeRemaining(
  endTime: Date | number,
  unit: "hours" | "minutes" = "hours"
): number {
  const endMs = typeof endTime === "number" ? endTime : endTime.getTime();
  const remaining = endMs - Date.now();

  if (remaining <= 0) return 0;

  const divisor = unit === "hours" ? 60 * 60 * 1000 : 60 * 1000;
  return Math.ceil(remaining / divisor);
}

/**
 * Check if a rejection cooldown is still active.
 *
 * @param rejectedAt - When the rejection occurred (Date or ISO string)
 * @returns Object with active status and hours remaining
 */
export function checkRejectionCooldown(
  rejectedAt: Date | string
): { active: boolean; hoursRemaining: number; cooldownEnds: Date } {
  const rejectedTime = typeof rejectedAt === "string"
    ? new Date(rejectedAt).getTime()
    : rejectedAt.getTime();

  const cooldownEnds = new Date(rejectedTime + REJECTION_COOLDOWN_MS);
  const now = Date.now();

  if (now >= cooldownEnds.getTime()) {
    return { active: false, hoursRemaining: 0, cooldownEnds };
  }

  const hoursRemaining = Math.ceil((cooldownEnds.getTime() - now) / (60 * 60 * 1000));
  return { active: true, hoursRemaining, cooldownEnds };
}

/**
 * Check if a voting window has expired.
 *
 * @param voteEndsAt - When the voting ends (Date or ISO string)
 * @returns True if the voting period has ended
 */
export function hasVotingEnded(voteEndsAt: Date | string | null): boolean {
  if (!voteEndsAt) return false;

  const endTime = typeof voteEndsAt === "string"
    ? new Date(voteEndsAt).getTime()
    : voteEndsAt.getTime();

  return Date.now() > endTime;
}
