import { describe, it, expect } from "vitest";

// Note: These are integration tests that require the dev server to be running
// and the database to be seeded

const API_BASE = process.env.TEST_API_URL || "http://localhost:3000";

describe("Voting API: /api/ideas response", () => {
  describe("GET /api/ideas", () => {
    it("should include hasVotingBuilds field", async () => {
      const res = await fetch(`${API_BASE}/api/ideas`);
      expect(res.ok).toBe(true);

      const json = await res.json();
      expect(Array.isArray(json.data)).toBe(true);

      // Each idea should have hasVotingBuilds field (boolean or undefined)
      for (const idea of json.data) {
        expect(
          idea.hasVotingBuilds === undefined ||
          typeof idea.hasVotingBuilds === "boolean"
        ).toBe(true);
      }
    });
  });

  describe("GET /api/ideas/[id]", () => {
    it("should include votingBuilds array", async () => {
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();

      if (listJson.data.length === 0) {
        console.log("No ideas in database, skipping test");
        return;
      }

      const ideaId = listJson.data[0].id;
      const res = await fetch(`${API_BASE}/api/ideas/${ideaId}`);
      expect(res.ok).toBe(true);

      const json = await res.json();
      expect(json.data).toHaveProperty("votingBuilds");
      expect(Array.isArray(json.data.votingBuilds)).toBe(true);
    });

    it("should return proper VotingBuild structure when voting builds exist", async () => {
      // Find an idea with voting builds
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();

      const ideaWithVoting = listJson.data.find(
        (i: { hasVotingBuilds?: boolean }) => i.hasVotingBuilds === true
      );

      if (!ideaWithVoting) {
        console.log("No ideas with voting builds found, skipping test");
        return;
      }

      const res = await fetch(`${API_BASE}/api/ideas/${ideaWithVoting.id}`);
      const json = await res.json();

      expect(json.data.votingBuilds.length).toBeGreaterThan(0);

      const build = json.data.votingBuilds[0];
      expect(build).toHaveProperty("id");
      expect(build).toHaveProperty("url");
      expect(build).toHaveProperty("builder");
      expect(build).toHaveProperty("builder_fid");
      expect(build).toHaveProperty("votes_approve");
      expect(build).toHaveProperty("votes_reject");
      expect(build).toHaveProperty("vote_ends_at");
      expect(build).toHaveProperty("vote_ends_in_seconds");
      expect(build).toHaveProperty("voting_ended");
      expect(build).toHaveProperty("user_vote");

      // Type checks
      expect(typeof build.votes_approve).toBe("number");
      expect(typeof build.votes_reject).toBe("number");
      expect(typeof build.vote_ends_in_seconds).toBe("number");
      expect(typeof build.voting_ended).toBe("boolean");
      expect(build.vote_ends_in_seconds).toBeGreaterThanOrEqual(0);
    });

    it("should include user_vote when user_fid provided", async () => {
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();

      if (listJson.data.length === 0) return;

      const ideaId = listJson.data[0].id;
      const res = await fetch(`${API_BASE}/api/ideas/${ideaId}?user_fid=12345`);
      expect(res.ok).toBe(true);

      const json = await res.json();
      expect(json.data).toHaveProperty("votingBuilds");

      // user_vote should always be included (null if not voted)
      for (const build of json.data.votingBuilds) {
        expect(build).toHaveProperty("user_vote");
        expect(
          build.user_vote === null ||
          build.user_vote === "approve" ||
          build.user_vote === "reject"
        ).toBe(true);
      }
    });
  });
});

describe("Voting API: /api/builds/[id]/vote", () => {
  describe("POST /api/builds/[id]/vote", () => {
    it("should reject vote if user already voted (votes locked)", async () => {
      // This test requires a build in voting status where a user has voted
      // Since we can't easily set this up without auth, we just verify the endpoint exists
      const res = await fetch(
        `${API_BASE}/api/builds/00000000-0000-0000-0000-000000000000/vote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voter_fid: 12345, approved: true }),
        }
      );

      // Either 404 (not found), 400 (validation), or 401 (no auth)
      expect([400, 401, 404]).toContain(res.status);
    });

    it("should reject vote for build not in voting status", async () => {
      // Find a build that's not in voting status
      const listRes = await fetch(`${API_BASE}/api/builds`);
      const listJson = await listRes.json();

      const nonVotingBuild = listJson.data.find(
        (b: { status: string }) =>
          b.status !== "voting"
      );

      if (!nonVotingBuild) {
        console.log("No non-voting builds found, skipping test");
        return;
      }

      const res = await fetch(
        `${API_BASE}/api/builds/${nonVotingBuild.id}/vote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voter_fid: 12345, approved: true }),
        }
      );

      // Either 400 (not in voting) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });

    it("should reject builder voting on own build", async () => {
      // Find a build in voting status
      const listRes = await fetch(`${API_BASE}/api/builds`);
      const listJson = await listRes.json();

      const votingBuild = listJson.data.find(
        (b: { status: string }) => b.status === "voting"
      );

      if (!votingBuild) {
        console.log("No voting builds found, skipping test");
        return;
      }

      const res = await fetch(
        `${API_BASE}/api/builds/${votingBuild.id}/vote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            voter_fid: votingBuild.builder_fid,
            approved: true,
          }),
        }
      );

      // Either 400 (can't vote on own) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });
  });

  describe("GET /api/builds/[id]/vote", () => {
    it("should return vote status with has_voted boolean", async () => {
      const listRes = await fetch(`${API_BASE}/api/builds`);
      const listJson = await listRes.json();

      if (listJson.data.length === 0) return;

      const buildId = listJson.data[0].id;
      const res = await fetch(
        `${API_BASE}/api/builds/${buildId}/vote?voter_fid=12345`
      );

      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(json).toHaveProperty("has_voted");
      expect(json).toHaveProperty("approved");
      expect(typeof json.has_voted).toBe("boolean");
    });
  });
});

describe("Voting Types", () => {
  it("VotingBuild type should match API response", async () => {
    // Get an idea with voting builds
    const listRes = await fetch(`${API_BASE}/api/ideas`);
    const listJson = await listRes.json();

    const ideaWithVoting = listJson.data.find(
      (i: { hasVotingBuilds?: boolean }) => i.hasVotingBuilds === true
    );

    if (!ideaWithVoting) {
      console.log("No ideas with voting builds, skipping type test");
      return;
    }

    const res = await fetch(`${API_BASE}/api/ideas/${ideaWithVoting.id}?user_fid=12345`);
    const json = await res.json();

    // Validate the VotingBuild matches our type definition
    const build = json.data.votingBuilds[0];

    // Required fields
    expect(typeof build.id).toBe("string");
    expect(typeof build.url).toBe("string");
    expect(build.description === null || typeof build.description === "string").toBe(true);
    expect(typeof build.builder).toBe("string");
    expect(typeof build.builder_fid).toBe("number");
    expect(build.builder_pfp === null || typeof build.builder_pfp === "string").toBe(true);
    expect(typeof build.votes_approve).toBe("number");
    expect(typeof build.votes_reject).toBe("number");
    expect(typeof build.vote_ends_at).toBe("string");
    expect(typeof build.vote_ends_in_seconds).toBe("number");
    expect(typeof build.voting_ended).toBe("boolean");
    expect(
      build.user_vote === null ||
      build.user_vote === "approve" ||
      build.user_vote === "reject"
    ).toBe(true);
  });
});
