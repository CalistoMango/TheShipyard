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
  VotingBuild,
} from "~/lib/types";

describe("Types", () => {
  describe("IdeaStatus", () => {
    it("should have valid status values", () => {
      const statuses: IdeaStatus[] = ["open", "racing", "completed", "already_exists"];
      expect(statuses).toHaveLength(4);
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

    it("should include hasVotingBuilds flag for list view badge", () => {
      const ideaWithVoting: Idea = {
        id: 2,
        title: "Idea with Voting",
        description: "An idea with active voting",
        category: "defi",
        pool: 150,
        upvotes: 20,
        submitter: "builder.eth",
        submitter_fid: 456,
        submitter_username: "builder",
        submitter_pfp: null,
        status: "racing",
        cast_hash: null,
        related_casts: [],
        solution_url: null,
        created_at: "2025-01-01T00:00:00Z",
        hasVotingBuilds: true,
      };

      expect(ideaWithVoting.hasVotingBuilds).toBe(true);
    });
  });

  describe("VotingBuild", () => {
    it("should have all required fields for voting UI", () => {
      const votingBuild: VotingBuild = {
        id: "build-uuid-123",
        url: "https://example.com/build",
        description: "A build submission for voting",
        builder: "testbuilder",
        builder_fid: 12345,
        builder_pfp: "https://example.com/pfp.png",
        votes_approve: 10,
        votes_reject: 3,
        vote_ends_at: "2025-01-20T00:00:00Z",
        vote_ends_in_seconds: 3600,
        voting_ended: false,
        user_vote: null,
      };

      expect(votingBuild.id).toBe("build-uuid-123");
      expect(votingBuild.votes_approve).toBe(10);
      expect(votingBuild.votes_reject).toBe(3);
      expect(votingBuild.voting_ended).toBe(false);
      expect(votingBuild.user_vote).toBeNull();
    });

    it("should support user_vote values for approve and reject", () => {
      const approvedBuild: VotingBuild = {
        id: "build-1",
        url: "https://example.com/build1",
        description: null,
        builder: "builder1",
        builder_fid: 111,
        builder_pfp: null,
        votes_approve: 15,
        votes_reject: 5,
        vote_ends_at: "2025-01-20T00:00:00Z",
        vote_ends_in_seconds: 1800,
        voting_ended: false,
        user_vote: "approve",
      };

      const rejectedBuild: VotingBuild = {
        id: "build-2",
        url: "https://example.com/build2",
        description: "Another build",
        builder: "builder2",
        builder_fid: 222,
        builder_pfp: "https://example.com/pfp2.png",
        votes_approve: 8,
        votes_reject: 12,
        vote_ends_at: "2025-01-20T00:00:00Z",
        vote_ends_in_seconds: 900,
        voting_ended: false,
        user_vote: "reject",
      };

      expect(approvedBuild.user_vote).toBe("approve");
      expect(rejectedBuild.user_vote).toBe("reject");
    });

    it("should handle voting_ended state from server", () => {
      const endedBuild: VotingBuild = {
        id: "build-ended",
        url: "https://example.com/ended",
        description: "Voting has ended",
        builder: "builder",
        builder_fid: 333,
        builder_pfp: null,
        votes_approve: 20,
        votes_reject: 10,
        vote_ends_at: "2025-01-15T00:00:00Z",
        vote_ends_in_seconds: 0,
        voting_ended: true,
        user_vote: "approve",
      };

      expect(endedBuild.voting_ended).toBe(true);
      expect(endedBuild.vote_ends_in_seconds).toBe(0);
    });

    it("should ensure vote_ends_in_seconds is non-negative", () => {
      const build: VotingBuild = {
        id: "build-test",
        url: "https://example.com/test",
        description: null,
        builder: "builder",
        builder_fid: 444,
        builder_pfp: null,
        votes_approve: 5,
        votes_reject: 5,
        vote_ends_at: "2025-01-10T00:00:00Z",
        vote_ends_in_seconds: 0, // Server uses Math.max(0, ...)
        voting_ended: true,
        user_vote: null,
      };

      expect(build.vote_ends_in_seconds).toBeGreaterThanOrEqual(0);
    });
  });
});
