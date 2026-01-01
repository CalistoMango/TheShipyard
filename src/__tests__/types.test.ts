import { describe, it, expect } from "vitest";
import type {
  IdeaStatus,
  BuildStatus,
  Category,
  ClaimType,
  DbIdea,
  DbUser,
  DbFunding,
  DbUsedClaimTx,
  Idea,
} from "~/lib/types";

describe("Types", () => {
  describe("IdeaStatus", () => {
    it("should have valid status values", () => {
      const statuses: IdeaStatus[] = ["open", "voting", "completed"];
      expect(statuses).toHaveLength(3);
    });
  });

  describe("BuildStatus", () => {
    it("should have valid build status values", () => {
      const statuses: BuildStatus[] = ["pending_review", "voting", "approved", "rejected"];
      expect(statuses).toHaveLength(4);
    });
  });

  describe("Category", () => {
    it("should have valid category values", () => {
      const categories: Category[] = ["games", "tools", "social", "defi", "content", "other"];
      expect(categories).toHaveLength(6);
    });
  });

  describe("ClaimType", () => {
    it("should have valid claim type values", () => {
      const claimTypes: ClaimType[] = ["refund", "reward"];
      expect(claimTypes).toHaveLength(2);
    });
  });

  describe("DbIdea", () => {
    it("should match expected shape", () => {
      const idea: DbIdea = {
        id: 1,
        title: "Test Idea",
        description: "A test idea",
        category: "tools",
        status: "open",
        cast_hash: null,
        related_casts: [],
        submitter_fid: 123,
        pool: 100,
        upvote_count: 10,
        solution_url: null,
        builder_reward_claimed: false,
        submitter_reward_claimed: false,
        reward_claim_tx_hash: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      expect(idea.id).toBe(1);
      expect(idea.title).toBe("Test Idea");
      expect(idea.category).toBe("tools");
      expect(idea.status).toBe("open");
    });

    it("should include reward claim tracking fields", () => {
      const completedIdea: DbIdea = {
        id: 2,
        title: "Completed Idea",
        description: "A completed idea with rewards claimed",
        category: "defi",
        status: "completed",
        cast_hash: "0xabc123",
        related_casts: [],
        submitter_fid: 456,
        pool: 500,
        upvote_count: 25,
        solution_url: "https://example.com/solution",
        builder_reward_claimed: true,
        submitter_reward_claimed: true,
        reward_claim_tx_hash: "0xrewardtx123456789",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-15T00:00:00Z",
      };

      expect(completedIdea.builder_reward_claimed).toBe(true);
      expect(completedIdea.submitter_reward_claimed).toBe(true);
      expect(completedIdea.reward_claim_tx_hash).toBe("0xrewardtx123456789");
    });
  });

  describe("DbUser", () => {
    it("should include cumulative claim tracking fields", () => {
      const user: DbUser = {
        fid: 12345,
        username: "testuser",
        display_name: "Test User",
        pfp_url: "https://example.com/pfp.png",
        wallet_address: "0x1234567890123456789012345678901234567890",
        balance: 100,
        streak: 5,
        claimed_rewards: 250.5,
        claimed_refunds: 50.0,
        last_reward_tx_hash: "0xlastrewardtx",
        last_refund_tx_hash: "0xlastrefundtx",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-15T00:00:00Z",
      };

      expect(user.claimed_rewards).toBe(250.5);
      expect(user.claimed_refunds).toBe(50.0);
      expect(user.last_reward_tx_hash).toBe("0xlastrewardtx");
      expect(user.last_refund_tx_hash).toBe("0xlastrefundtx");
    });

    it("should allow null tx_hash fields for users who haven't claimed", () => {
      const newUser: DbUser = {
        fid: 99999,
        username: "newuser",
        display_name: "New User",
        pfp_url: null,
        wallet_address: null,
        balance: 0,
        streak: 0,
        claimed_rewards: 0,
        claimed_refunds: 0,
        last_reward_tx_hash: null,
        last_refund_tx_hash: null,
        created_at: "2025-01-15T00:00:00Z",
        updated_at: "2025-01-15T00:00:00Z",
      };

      expect(newUser.claimed_rewards).toBe(0);
      expect(newUser.claimed_refunds).toBe(0);
      expect(newUser.last_reward_tx_hash).toBeNull();
      expect(newUser.last_refund_tx_hash).toBeNull();
    });
  });

  describe("DbFunding", () => {
    it("should include tx_hash for replay protection", () => {
      const funding: DbFunding = {
        id: "funding-uuid-123",
        idea_id: 1,
        funder_fid: 12345,
        amount: 50,
        tx_hash: "0xfundingtx123456789",
        refunded_at: null,
        refund_tx_hash: null,
        created_at: "2025-01-10T00:00:00Z",
      };

      expect(funding.tx_hash).toBe("0xfundingtx123456789");
      expect(funding.refunded_at).toBeNull();
      expect(funding.refund_tx_hash).toBeNull();
    });

    it("should track refund status and tx_hash", () => {
      const refundedFunding: DbFunding = {
        id: "funding-uuid-456",
        idea_id: 2,
        funder_fid: 12345,
        amount: 100,
        tx_hash: "0xoriginalfundingtx",
        refunded_at: "2025-02-01T00:00:00Z",
        refund_tx_hash: "0xrefundtx123456789",
        created_at: "2025-01-01T00:00:00Z",
      };

      expect(refundedFunding.refunded_at).toBe("2025-02-01T00:00:00Z");
      expect(refundedFunding.refund_tx_hash).toBe("0xrefundtx123456789");
    });

    it("should allow null tx_hash for legacy/off-chain funding", () => {
      const legacyFunding: DbFunding = {
        id: "funding-uuid-789",
        idea_id: 3,
        funder_fid: 54321,
        amount: 25,
        tx_hash: null,
        refunded_at: null,
        refund_tx_hash: null,
        created_at: "2024-12-01T00:00:00Z",
      };

      expect(legacyFunding.tx_hash).toBeNull();
    });
  });

  describe("DbUsedClaimTx", () => {
    it("should track used claim transactions for replay protection", () => {
      const usedTx: DbUsedClaimTx = {
        tx_hash: "0xclaimtx123456789",
        user_fid: 12345,
        claim_type: "refund",
        amount: 100.5,
        created_at: "2025-01-15T00:00:00Z",
      };

      expect(usedTx.tx_hash).toBe("0xclaimtx123456789");
      expect(usedTx.claim_type).toBe("refund");
      expect(usedTx.amount).toBe(100.5);
    });

    it("should support both refund and reward claim types", () => {
      const refundTx: DbUsedClaimTx = {
        tx_hash: "0xrefundtx",
        user_fid: 12345,
        claim_type: "refund",
        amount: 50,
        created_at: "2025-01-15T00:00:00Z",
      };

      const rewardTx: DbUsedClaimTx = {
        tx_hash: "0xrewardtx",
        user_fid: 12345,
        claim_type: "reward",
        amount: 85,
        created_at: "2025-01-15T00:00:00Z",
      };

      expect(refundTx.claim_type).toBe("refund");
      expect(rewardTx.claim_type).toBe("reward");
    });
  });

  describe("Idea (frontend type)", () => {
    it("should have submitter as string for display", () => {
      const idea: Idea = {
        id: 1,
        title: "Test Idea",
        description: "A test idea",
        category: "tools",
        pool: 100,
        upvotes: 10,
        submitter: "testuser.eth",
        submitter_fid: 123,
        submitter_username: "testuser",
        submitter_pfp: null,
        status: "open",
        cast_hash: null,
        related_casts: [],
        solution_url: null,
        created_at: "2025-01-01T00:00:00Z",
      };

      expect(idea.submitter).toBe("testuser.eth");
      expect(typeof idea.submitter).toBe("string");
    });
  });
});
