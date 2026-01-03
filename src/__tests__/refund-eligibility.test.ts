import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkUserRefundEligibility,
  checkRefundEligibility,
  type FundingRecord,
  type IdeaRefundInfo,
} from "~/lib/refund";

// Mock REFUND_DELAY_DAYS to 30 for consistent testing
vi.mock("~/lib/constants", () => ({
  REFUND_DELAY_DAYS: 30,
}));

describe("Refund Eligibility", () => {
  describe("checkUserRefundEligibility - V2 Per-User Eligibility", () => {
    const NOW = new Date("2025-02-15T12:00:00Z").getTime();

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return not eligible when idea status is completed", () => {
      const funding: FundingRecord[] = [
        { id: "1", amount: 10, created_at: "2025-01-01T00:00:00Z", refunded_at: null },
      ];

      const result = checkUserRefundEligibility("completed", funding);

      expect(result.eligible).toBe(false);
      expect(result.totalUnrefunded).toBe(0);
      expect(result.latestFundingAt).toBeNull();
    });

    it("should return not eligible when idea status is voting", () => {
      const funding: FundingRecord[] = [
        { id: "1", amount: 10, created_at: "2025-01-01T00:00:00Z", refunded_at: null },
      ];

      const result = checkUserRefundEligibility("voting", funding);

      expect(result.eligible).toBe(false);
      expect(result.totalUnrefunded).toBe(0);
      expect(result.latestFundingAt).toBeNull();
    });

    it("should return immediately eligible when idea status is already_exists", () => {
      // User funded very recently (5 days ago) - normally would need to wait
      const funding: FundingRecord[] = [
        { id: "1", amount: 10, created_at: "2025-02-10T00:00:00Z", refunded_at: null },
      ];

      const result = checkUserRefundEligibility("already_exists", funding);

      // Should be immediately eligible regardless of timing
      expect(result.eligible).toBe(true);
      expect(result.totalUnrefunded).toBe(10);
      expect(result.daysUntilRefund).toBe(0);
      expect(result.latestFundingAt).toEqual(new Date("2025-02-10T00:00:00Z"));
    });

    it("should return immediately eligible for already_exists even with multiple fundings", () => {
      const funding: FundingRecord[] = [
        { id: "1", amount: 5, created_at: "2025-02-10T00:00:00Z", refunded_at: null },
        { id: "2", amount: 10, created_at: "2025-02-14T00:00:00Z", refunded_at: null },
      ];

      const result = checkUserRefundEligibility("already_exists", funding);

      expect(result.eligible).toBe(true);
      expect(result.totalUnrefunded).toBe(15);
      expect(result.daysUntilRefund).toBe(0);
    });

    it("should return not eligible when user has no funding", () => {
      const result = checkUserRefundEligibility("open", []);

      expect(result.eligible).toBe(false);
      expect(result.totalUnrefunded).toBe(0);
      expect(result.latestFundingAt).toBeNull();
    });

    it("should return not eligible when all funding is already refunded", () => {
      const funding: FundingRecord[] = [
        { id: "1", amount: 10, created_at: "2025-01-01T00:00:00Z", refunded_at: "2025-02-01T00:00:00Z" },
        { id: "2", amount: 5, created_at: "2025-01-05T00:00:00Z", refunded_at: "2025-02-01T00:00:00Z" },
      ];

      const result = checkUserRefundEligibility("open", funding);

      expect(result.eligible).toBe(false);
      expect(result.totalUnrefunded).toBe(0);
      expect(result.latestFundingAt).toBeNull();
    });

    it("should return eligible when 30 days passed since latest funding", () => {
      // User funded on Jan 1 (45 days ago from Feb 15)
      const funding: FundingRecord[] = [
        { id: "1", amount: 10, created_at: "2025-01-01T00:00:00Z", refunded_at: null },
      ];

      const result = checkUserRefundEligibility("open", funding);

      expect(result.eligible).toBe(true);
      expect(result.totalUnrefunded).toBe(10);
      expect(result.daysSinceLastFunding).toBeGreaterThanOrEqual(30);
      expect(result.daysUntilRefund).toBe(0);
    });

    it("should return not eligible when less than 30 days since latest funding", () => {
      // User funded on Feb 1 (14 days ago from Feb 15)
      const funding: FundingRecord[] = [
        { id: "1", amount: 10, created_at: "2025-02-01T00:00:00Z", refunded_at: null },
      ];

      const result = checkUserRefundEligibility("open", funding);

      expect(result.eligible).toBe(false);
      expect(result.totalUnrefunded).toBe(10);
      expect(result.daysSinceLastFunding).toBeLessThan(30);
      expect(result.daysUntilRefund).toBeGreaterThan(0);
    });

    it("should use LATEST funding date, not earliest", () => {
      // User funded $5 on Jan 1 (45 days ago - would be eligible)
      // User funded $5 on Feb 1 (14 days ago - not eligible yet)
      // 30-day clock should reset to Feb 1, making them NOT eligible
      const funding: FundingRecord[] = [
        { id: "1", amount: 5, created_at: "2025-01-01T00:00:00Z", refunded_at: null },
        { id: "2", amount: 5, created_at: "2025-02-01T00:00:00Z", refunded_at: null },
      ];

      const result = checkUserRefundEligibility("open", funding);

      expect(result.eligible).toBe(false);
      expect(result.totalUnrefunded).toBe(10); // All unrefunded funding
      // Latest funding was Feb 1, so ~14 days ago
      expect(result.daysSinceLastFunding).toBeLessThan(30);
    });

    it("should only consider unrefunded funding for latest date calculation", () => {
      // User funded $5 on Feb 10 (refunded)
      // User funded $5 on Jan 1 (not refunded, 45 days ago - eligible)
      // Since Feb 10 funding is refunded, the latest UNREFUNDED is Jan 1
      const funding: FundingRecord[] = [
        { id: "1", amount: 5, created_at: "2025-01-01T00:00:00Z", refunded_at: null },
        { id: "2", amount: 5, created_at: "2025-02-10T00:00:00Z", refunded_at: "2025-02-11T00:00:00Z" },
      ];

      const result = checkUserRefundEligibility("open", funding);

      expect(result.eligible).toBe(true);
      expect(result.totalUnrefunded).toBe(5); // Only the unrefunded Jan 1 funding
    });

    it("should sum all unrefunded funding for totalUnrefunded", () => {
      const funding: FundingRecord[] = [
        { id: "1", amount: 5, created_at: "2025-01-01T00:00:00Z", refunded_at: null },
        { id: "2", amount: 10, created_at: "2025-01-05T00:00:00Z", refunded_at: null },
        { id: "3", amount: 15, created_at: "2025-01-10T00:00:00Z", refunded_at: null },
        { id: "4", amount: 20, created_at: "2025-01-02T00:00:00Z", refunded_at: "2025-02-01T00:00:00Z" }, // Refunded, not counted
      ];

      const result = checkUserRefundEligibility("open", funding);

      expect(result.totalUnrefunded).toBe(30); // 5 + 10 + 15
    });

    it("should calculate daysUntilRefund correctly", () => {
      // User funded on Feb 5 (10 days ago from Feb 15)
      // Should need 20 more days (30 - 10)
      const funding: FundingRecord[] = [
        { id: "1", amount: 10, created_at: "2025-02-05T00:00:00Z", refunded_at: null },
      ];

      const result = checkUserRefundEligibility("open", funding);

      expect(result.eligible).toBe(false);
      expect(result.daysUntilRefund).toBe(20);
    });

    it("should handle edge case at exactly 30 days", () => {
      // User funded exactly 30 days ago (Jan 16 from Feb 15)
      const funding: FundingRecord[] = [
        { id: "1", amount: 10, created_at: "2025-01-16T12:00:00Z", refunded_at: null },
      ];

      const result = checkUserRefundEligibility("open", funding);

      expect(result.eligible).toBe(true);
      expect(result.daysUntilRefund).toBe(0);
    });

    it("should correctly identify the latest funding among many records", () => {
      // Multiple funding records over time
      const funding: FundingRecord[] = [
        { id: "1", amount: 5, created_at: "2024-12-01T00:00:00Z", refunded_at: null },
        { id: "2", amount: 10, created_at: "2024-12-15T00:00:00Z", refunded_at: null },
        { id: "3", amount: 3, created_at: "2025-01-05T00:00:00Z", refunded_at: null }, // This is the latest
        { id: "4", amount: 7, created_at: "2024-11-20T00:00:00Z", refunded_at: null },
      ];

      const result = checkUserRefundEligibility("open", funding);

      // Jan 5 is ~41 days before Feb 15
      expect(result.eligible).toBe(true);
      expect(result.totalUnrefunded).toBe(25); // 5 + 10 + 3 + 7
      expect(result.latestFundingAt).toEqual(new Date("2025-01-05T00:00:00Z"));
    });
  });

  describe("checkRefundEligibility - Deprecated Idea-Level Check", () => {
    const NOW = new Date("2025-02-15T12:00:00Z").getTime();

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return not eligible for non-open ideas", () => {
      const idea: IdeaRefundInfo = {
        status: "completed",
        updated_at: "2025-01-01T00:00:00Z",
        created_at: "2024-12-01T00:00:00Z",
      };

      const result = checkRefundEligibility(idea);

      expect(result.eligible).toBe(false);
      expect(result.daysSinceActivity).toBe(0);
      expect(result.daysUntilRefund).toBe(0);
    });

    it("should use updated_at for activity timestamp", () => {
      const idea: IdeaRefundInfo = {
        status: "open",
        updated_at: "2025-01-01T00:00:00Z", // 45 days ago
        created_at: "2024-12-01T00:00:00Z",
      };

      const result = checkRefundEligibility(idea);

      expect(result.eligible).toBe(true);
      expect(result.daysSinceActivity).toBeGreaterThanOrEqual(30);
    });

    it("should fallback to created_at when updated_at is null", () => {
      const idea: IdeaRefundInfo = {
        status: "open",
        updated_at: null,
        created_at: "2025-01-01T00:00:00Z", // 45 days ago
      };

      const result = checkRefundEligibility(idea);

      expect(result.eligible).toBe(true);
    });
  });

  describe("Per-User Eligibility Scenarios", () => {
    const NOW = new Date("2025-02-15T12:00:00Z").getTime();

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("User A funds twice, User B funds once - independent timers", () => {
      // User A: funded $5 day 0 (Dec 31), $5 day 10 (Jan 10) → eligible Feb 9 (Jan 10 + 30)
      // User B: funded $5 day 5 (Jan 5) → eligible Feb 4 (Jan 5 + 30)
      // Current date: Feb 15
      // Both should be eligible

      const userAFunding: FundingRecord[] = [
        { id: "a1", amount: 5, created_at: "2024-12-31T00:00:00Z", refunded_at: null },
        { id: "a2", amount: 5, created_at: "2025-01-10T00:00:00Z", refunded_at: null },
      ];

      const userBFunding: FundingRecord[] = [
        { id: "b1", amount: 5, created_at: "2025-01-05T00:00:00Z", refunded_at: null },
      ];

      const resultA = checkUserRefundEligibility("open", userAFunding);
      const resultB = checkUserRefundEligibility("open", userBFunding);

      // User A's latest funding was Jan 10, 36 days ago
      expect(resultA.eligible).toBe(true);
      expect(resultA.totalUnrefunded).toBe(10);

      // User B's latest (only) funding was Jan 5, 41 days ago
      expect(resultB.eligible).toBe(true);
      expect(resultB.totalUnrefunded).toBe(5);
    });

    it("User funds, then refunds partially, then funds again - timer resets", () => {
      // User funded $10 on Dec 1 (refunded)
      // User funded $5 on Feb 10 (5 days ago) - NOT eligible yet
      const funding: FundingRecord[] = [
        { id: "1", amount: 10, created_at: "2024-12-01T00:00:00Z", refunded_at: "2025-01-15T00:00:00Z" },
        { id: "2", amount: 5, created_at: "2025-02-10T00:00:00Z", refunded_at: null },
      ];

      const result = checkUserRefundEligibility("open", funding);

      expect(result.eligible).toBe(false);
      expect(result.totalUnrefunded).toBe(5);
      expect(result.daysUntilRefund).toBe(25); // 30 - 5
    });

    it("All funding refunded - no longer eligible", () => {
      const funding: FundingRecord[] = [
        { id: "1", amount: 10, created_at: "2024-12-01T00:00:00Z", refunded_at: "2025-01-15T00:00:00Z" },
        { id: "2", amount: 5, created_at: "2024-12-15T00:00:00Z", refunded_at: "2025-01-15T00:00:00Z" },
      ];

      const result = checkUserRefundEligibility("open", funding);

      expect(result.eligible).toBe(false);
      expect(result.totalUnrefunded).toBe(0);
    });
  });
});
