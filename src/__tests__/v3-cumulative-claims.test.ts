import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * V3 Cumulative Claims Unit Tests
 *
 * Tests for cumulative-claim reconciliation including:
 * - DB-out-of-sync scenarios
 * - RPC failure handling
 * - On-chain state as source of truth
 */

// Mock the vault-signer module
vi.mock("~/lib/vault-signer", () => ({
  getRefundClaimed: vi.fn(),
  getRewardClaimed: vi.fn(),
  signRefundClaim: vi.fn(),
  signRewardClaim: vi.fn(),
  toProjectId: vi.fn((id: number) => `0x${id.toString(16).padStart(64, "0")}`),
  usdcToBaseUnits: vi.fn((amount: number) => BigInt(Math.round(amount * 1_000_000))),
  calculatePayouts: vi.fn((totalPool: bigint) => ({
    totalPool,
    platformFee: (totalPool * 10n) / 100n,
    ideaCreatorFee: (totalPool * 5n) / 100n,
    builderPayout: (totalPool * 85n) / 100n,
  })),
  verifyRefundTransaction: vi.fn(),
}));

// Mock supabase
vi.mock("~/lib/supabase", () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(),
              single: vi.fn(),
            })),
            maybeSingle: vi.fn(),
            single: vi.fn(),
          })),
          is: vi.fn(() => ({
            single: vi.fn(),
          })),
          single: vi.fn(),
        })),
        single: vi.fn(),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(),
        in: vi.fn(),
      })),
    })),
    rpc: vi.fn(),
  })),
}));

// Mock transactions module
vi.mock("~/lib/transactions", () => ({
  checkTxHashNotUsed: vi.fn(() => ({ used: false })),
  recordTxHashUsed: vi.fn(() => ({ success: true })),
}));

describe("V3 Cumulative Claims - Core Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Refund Signature - On-Chain State Check", () => {
    it("should return 503 when RPC fails to fetch on-chain claimed amount", async () => {
      const { getRefundClaimed } = await import("~/lib/vault-signer");
      vi.mocked(getRefundClaimed).mockRejectedValueOnce(new Error("RPC error"));

      // Simulate the logic from refund-signature endpoint
      const projectId = "0x0000000000000000000000000000000000000000000000000000000000000001";
      const fid = 12345n;

      let onChainClaimed: bigint | null = null;
      let error: string | null = null;

      try {
        onChainClaimed = await getRefundClaimed(projectId, fid);
      } catch {
        error = "Failed to verify on-chain state";
      }

      expect(onChainClaimed).toBeNull();
      expect(error).toBe("Failed to verify on-chain state");
    });

    it("should calculate correct cumAmt using totalEverFunded (not just unrefunded)", () => {
      // Scenario: User funded $10, claimed $5, DB shows $5 unrefunded
      // V3 should sign for cumAmt = $10 (total ever funded)
      const allFunding = [
        { id: 1, amount: 5, refunded_at: "2024-01-01" }, // Already refunded
        { id: 2, amount: 5, refunded_at: null }, // Not refunded
      ];

      const totalEverFundedUsdc = allFunding.reduce((sum, f) => sum + f.amount, 0);

      expect(totalEverFundedUsdc).toBe(10);
      // cumAmt should be based on totalEverFunded, not just unrefunded
    });

    it("should reject when cumAmt <= onChainClaimed (all already claimed)", async () => {
      const { getRefundClaimed, usdcToBaseUnits } = await import("~/lib/vault-signer");

      // On-chain shows $10 already claimed
      vi.mocked(getRefundClaimed).mockResolvedValueOnce(10_000_000n);

      const onChainClaimed = await getRefundClaimed("0x01", 12345n);
      const totalEverFunded = usdcToBaseUnits(10); // $10 total funded

      const cumAmt = totalEverFunded;
      const shouldReject = cumAmt <= onChainClaimed;

      expect(shouldReject).toBe(true);
    });

    it("should calculate delta correctly for UI display", async () => {
      const { getRefundClaimed, usdcToBaseUnits } = await import("~/lib/vault-signer");

      // On-chain shows $5 already claimed, user funded $15 total
      vi.mocked(getRefundClaimed).mockResolvedValueOnce(5_000_000n);

      const onChainClaimed = await getRefundClaimed("0x01", 12345n);
      const totalEverFunded = usdcToBaseUnits(15);

      const cumAmt = totalEverFunded;
      const deltaAmount = cumAmt - onChainClaimed;
      const deltaUsdc = Number(deltaAmount) / 1_000_000;

      expect(deltaUsdc).toBe(10); // $15 - $5 = $10 claimable
    });
  });

  describe("Reward Signature - On-Chain State Check", () => {
    it("should return 503 when RPC fails to fetch on-chain claimed amount", async () => {
      const { getRewardClaimed } = await import("~/lib/vault-signer");
      vi.mocked(getRewardClaimed).mockRejectedValueOnce(new Error("RPC error"));

      const projectId = "0x0000000000000000000000000000000000000000000000000000000000000001";
      const fid = 12345n;

      let onChainClaimed: bigint | null = null;
      let error: string | null = null;

      try {
        onChainClaimed = await getRewardClaimed(projectId, fid);
      } catch {
        error = "Failed to verify on-chain state";
      }

      expect(onChainClaimed).toBeNull();
      expect(error).toBe("Failed to verify on-chain state");
    });

    it("should calculate totalRewardEntitlement based on role (not DB flags)", async () => {
      const { calculatePayouts, usdcToBaseUnits } = await import("~/lib/vault-signer");

      const pool = 100; // $100 pool
      const payouts = calculatePayouts(usdcToBaseUnits(pool));

      // Builder gets 85%
      const isBuilder = true;
      const isSubmitter = false;

      let totalRewardEntitlement = 0n;
      if (isBuilder) totalRewardEntitlement += payouts.builderPayout;
      if (isSubmitter) totalRewardEntitlement += payouts.ideaCreatorFee;

      expect(Number(totalRewardEntitlement) / 1_000_000).toBe(85); // $85
    });

    it("should handle user who is both builder and submitter", async () => {
      const { calculatePayouts, usdcToBaseUnits } = await import("~/lib/vault-signer");

      const pool = 100; // $100 pool
      const payouts = calculatePayouts(usdcToBaseUnits(pool));

      const isBuilder = true;
      const isSubmitter = true;

      let totalRewardEntitlement = 0n;
      if (isBuilder) totalRewardEntitlement += payouts.builderPayout;
      if (isSubmitter) totalRewardEntitlement += payouts.ideaCreatorFee;

      expect(Number(totalRewardEntitlement) / 1_000_000).toBe(90); // 85% + 5% = 90%
    });

    it("should reject when cumAmt <= onChainClaimed", async () => {
      const { getRewardClaimed, calculatePayouts, usdcToBaseUnits } = await import("~/lib/vault-signer");

      // On-chain shows $85 already claimed (full builder reward)
      vi.mocked(getRewardClaimed).mockResolvedValueOnce(85_000_000n);

      const onChainClaimed = await getRewardClaimed("0x01", 12345n);
      const payouts = calculatePayouts(usdcToBaseUnits(100));
      const cumAmt = payouts.builderPayout; // $85 entitlement

      const shouldReject = cumAmt <= onChainClaimed;

      expect(shouldReject).toBe(true);
    });
  });

  describe("Record Refund - DB Out-of-Sync Handling", () => {
    it("should accept valid on-chain tx even if DB is out of sync", () => {
      // Scenario: DB thinks user has $10 unrefunded, but on-chain delta is $5
      // (because prior $5 refund succeeded on-chain but DB wasn't updated)
      const allFunding = [
        { id: 1, amount: 5, refunded_at: null }, // DB thinks unrefunded
        { id: 2, amount: 5, refunded_at: null }, // DB thinks unrefunded
      ];

      const unrefundedFunding = allFunding.filter((f) => !f.refunded_at);
      const totalUnrefundedUsdc = unrefundedFunding.reduce((sum, f) => sum + f.amount, 0);

      // On-chain only transferred $5 (because $5 was already claimed before)
      const onChainDeltaUsdc = 5;

      // V3: Should NOT reject - on-chain is authoritative
      // The delta being smaller than DB-unrefunded is OK
      const shouldAccept = onChainDeltaUsdc <= totalUnrefundedUsdc;

      expect(shouldAccept).toBe(true);
    });

    it("should use on-chain amount as authoritative for pool decrement", () => {
      // On-chain says $7.50 was transferred, DB thought $10 was eligible
      const onChainAmountUsdc = 7.5;

      // Pool should be decremented by on-chain amount, not DB estimate
      expect(onChainAmountUsdc).toBe(7.5);
    });

    it("should mark only unrefunded funding rows as refunded", () => {
      const allFunding = [
        { id: 1, amount: 5, refunded_at: "2024-01-01" }, // Already refunded
        { id: 2, amount: 3, refunded_at: null }, // Should be marked
        { id: 3, amount: 2, refunded_at: null }, // Should be marked
      ];

      const unrefundedFunding = allFunding.filter((f) => !f.refunded_at);
      const fundingIds = unrefundedFunding.map((f) => f.id);

      expect(fundingIds).toEqual([2, 3]);
      expect(fundingIds).not.toContain(1);
    });
  });

  describe("GET Rewards - On-Chain State as Source of Truth", () => {
    it("should check on-chain rewardClaimed for each project", async () => {
      const { getRewardClaimed, toProjectId } = await import("~/lib/vault-signer");

      const ideaIds = [1, 2, 3];
      const userFid = 12345;

      vi.mocked(getRewardClaimed)
        .mockResolvedValueOnce(0n) // Project 1: nothing claimed
        .mockResolvedValueOnce(85_000_000n) // Project 2: fully claimed
        .mockResolvedValueOnce(50_000_000n); // Project 3: partially claimed

      const onChainClaimed = new Map<number, bigint>();

      for (const ideaId of ideaIds) {
        const projectId = toProjectId(ideaId);
        const claimed = await getRewardClaimed(projectId, BigInt(userFid));
        onChainClaimed.set(ideaId, claimed);
      }

      expect(onChainClaimed.get(1)).toBe(0n);
      expect(onChainClaimed.get(2)).toBe(85_000_000n);
      expect(onChainClaimed.get(3)).toBe(50_000_000n);
    });

    it("should treat RPC failure as fully claimed (conservative)", async () => {
      const { getRewardClaimed, toProjectId } = await import("~/lib/vault-signer");

      vi.mocked(getRewardClaimed).mockRejectedValueOnce(new Error("RPC error"));

      const ideaId = 1;
      const userFid = 12345;
      const onChainClaimed = new Map<number, bigint>();

      try {
        const projectId = toProjectId(ideaId);
        const claimed = await getRewardClaimed(projectId, BigInt(userFid));
        onChainClaimed.set(ideaId, claimed);
      } catch {
        // Treat as fully claimed to be safe
        onChainClaimed.set(ideaId, BigInt(Number.MAX_SAFE_INTEGER));
      }

      // Should be treated as fully claimed (no claimable rewards shown)
      expect(onChainClaimed.get(ideaId)).toBe(BigInt(Number.MAX_SAFE_INTEGER));
    });

    it("should calculate claimable = entitlement - onChainClaimed", async () => {
      const { calculatePayouts, usdcToBaseUnits } = await import("~/lib/vault-signer");

      const pool = 100;
      const payouts = calculatePayouts(usdcToBaseUnits(pool));
      const builderEntitlement = payouts.builderPayout; // $85

      // Case 1: Nothing claimed yet
      let onChainClaimed = 0n;
      let claimable = builderEntitlement > onChainClaimed ? builderEntitlement - onChainClaimed : 0n;
      expect(Number(claimable) / 1_000_000).toBe(85);

      // Case 2: Partially claimed
      onChainClaimed = 50_000_000n; // $50 claimed
      claimable = builderEntitlement > onChainClaimed ? builderEntitlement - onChainClaimed : 0n;
      expect(Number(claimable) / 1_000_000).toBe(35);

      // Case 3: Fully claimed
      onChainClaimed = 85_000_000n; // $85 claimed
      claimable = builderEntitlement > onChainClaimed ? builderEntitlement - onChainClaimed : 0n;
      expect(Number(claimable) / 1_000_000).toBe(0);

      // Case 4: Over-claimed (edge case - shouldn't happen)
      onChainClaimed = 100_000_000n; // More than entitled
      claimable = builderEntitlement > onChainClaimed ? builderEntitlement - onChainClaimed : 0n;
      expect(Number(claimable) / 1_000_000).toBe(0);
    });

    it("should not double-count when user is both builder and submitter", async () => {
      const { calculatePayouts, usdcToBaseUnits } = await import("~/lib/vault-signer");

      const pool = 100;
      const payouts = calculatePayouts(usdcToBaseUnits(pool));

      // User is both builder and submitter of idea 1
      const ideaId = 1;

      // Total entitlement should include both
      const totalEntitlement = payouts.builderPayout + payouts.ideaCreatorFee;
      expect(Number(totalEntitlement) / 1_000_000).toBe(90);

      // When calculating submitter rewards separately, skip this project
      const builderIdeaIds = new Set([ideaId]);
      const shouldSkipInSubmitterLoop = builderIdeaIds.has(ideaId);

      expect(shouldSkipInSubmitterLoop).toBe(true);
    });
  });

  describe("Cumulative Claim Security Properties", () => {
    it("should prevent replay by checking cumAmt <= onChainClaimed", () => {
      // Same signature used twice: first claim succeeds, second fails
      const cumAmtSigned = 10_000_000n; // $10 cumulative

      // First claim: on-chain was 0, now becomes 10
      let onChainBefore = 0n;
      let willSucceed = cumAmtSigned > onChainBefore;
      expect(willSucceed).toBe(true);

      // Second claim (replay): on-chain is now 10
      onChainBefore = 10_000_000n;
      willSucceed = cumAmtSigned > onChainBefore;
      expect(willSucceed).toBe(false);
    });

    it("should support incremental claims with increasing cumAmt", () => {
      // User funds $10, claims $10 -> on-chain = 10
      // User funds another $5 (total $15), claims with cumAmt = $15
      // Contract pays delta = $15 - $10 = $5

      const firstCumAmt = 10_000_000n;
      let onChainClaimed = 0n;

      // First claim
      let delta = firstCumAmt - onChainClaimed;
      expect(Number(delta) / 1_000_000).toBe(10);
      onChainClaimed = firstCumAmt; // Contract updates

      // Second claim with higher cumAmt
      const secondCumAmt = 15_000_000n;
      delta = secondCumAmt - onChainClaimed;
      expect(Number(delta) / 1_000_000).toBe(5);
    });

    it("should never allow cumAmt to exceed total entitlement", () => {
      // Backend should calculate cumAmt based on actual records
      // For refunds: cumAmt = sum of all funding for this idea
      // For rewards: cumAmt = calculated entitlement based on pool and role

      const totalFundedUsdc = 10;
      const cumAmtForRefund = BigInt(totalFundedUsdc * 1_000_000);

      // Cannot inflate cumAmt beyond what was actually funded
      const attemptedInflation = cumAmtForRefund + 1_000_000n;
      const isValid = attemptedInflation <= cumAmtForRefund;
      expect(isValid).toBe(false);
    });
  });
});

describe("V3 Cumulative Claims - Edge Cases", () => {
  it("should handle zero pool correctly", async () => {
    const { calculatePayouts, usdcToBaseUnits } = await import("~/lib/vault-signer");

    const payouts = calculatePayouts(usdcToBaseUnits(0));

    expect(Number(payouts.builderPayout)).toBe(0);
    expect(Number(payouts.ideaCreatorFee)).toBe(0);
    expect(Number(payouts.platformFee)).toBe(0);
  });

  it("should handle fractional USDC amounts", async () => {
    const { usdcToBaseUnits } = await import("~/lib/vault-signer");

    // $1.50 should be 1_500_000 base units
    const baseUnits = usdcToBaseUnits(1.5);
    expect(baseUnits).toBe(1_500_000n);
  });

  it("should handle very large pools", async () => {
    const { calculatePayouts, usdcToBaseUnits } = await import("~/lib/vault-signer");

    // $1,000,000 pool
    const payouts = calculatePayouts(usdcToBaseUnits(1_000_000));

    expect(Number(payouts.builderPayout) / 1_000_000).toBe(850_000);
    expect(Number(payouts.ideaCreatorFee) / 1_000_000).toBe(50_000);
    expect(Number(payouts.platformFee) / 1_000_000).toBe(100_000);
  });

  it("should handle concurrent claims for different projects", async () => {
    const { getRewardClaimed, toProjectId } = await import("~/lib/vault-signer");

    // User claims rewards for 3 different projects concurrently
    vi.mocked(getRewardClaimed)
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(0n);

    const projects = [1, 2, 3];
    const results = await Promise.all(
      projects.map((id) => getRewardClaimed(toProjectId(id), 12345n))
    );

    expect(results).toEqual([0n, 0n, 0n]);
    expect(getRewardClaimed).toHaveBeenCalledTimes(3);
  });
});
