import { describe, it, expect } from "vitest";

// Note: These are integration tests that require the dev server to be running

const API_BASE = process.env.TEST_API_URL || "http://localhost:3000";
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN;
const AUTH_FID = process.env.TEST_AUTH_FID ? Number(process.env.TEST_AUTH_FID) : null;
const AUTH_HEADERS = AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {};

describe("API: /api/users", () => {
  describe("GET /api/users", () => {
    it("should require authentication", async () => {
      const res = await fetch(`${API_BASE}/api/users?fids=123`);
      expect(res.status).toBe(401);
    });

    it("should reject missing fids when authenticated", async () => {
      if (!AUTH_TOKEN) {
        console.log("Skipping /api/users auth test - no auth token configured");
        return;
      }

      const res = await fetch(`${API_BASE}/api/users`, {
        headers: AUTH_HEADERS,
      });

      expect(res.status).toBe(400);
    });
  });
});

describe("API: /api/users/[fid]", () => {
  describe("GET /api/users/[fid]", () => {
    it("should return 400 for invalid FID", async () => {
      const res = await fetch(`${API_BASE}/api/users/invalid`);
      expect(res.status).toBe(400);
    });

    it("should return 404 for non-existent user", async () => {
      const res = await fetch(`${API_BASE}/api/users/999999999`);
      expect(res.status).toBe(404);
    });

    it("should return user profile", async () => {
      // Try to find an existing user from ideas
      const ideasRes = await fetch(`${API_BASE}/api/ideas`);
      const ideasJson = await ideasRes.json();

      if (ideasJson.data.length === 0) {
        console.log("No ideas found, skipping test");
        return;
      }

      // Find an idea with a submitter
      const ideaWithSubmitter = ideasJson.data.find(
        (i: { submitter_fid: number | null }) => i.submitter_fid
      );

      if (!ideaWithSubmitter) {
        console.log("No idea with submitter found, skipping test");
        return;
      }

      const res = await fetch(
        `${API_BASE}/api/users/${ideaWithSubmitter.submitter_fid}`
      );

      expect(res.ok).toBe(true);
      const json = await res.json();

      expect(json.data).toHaveProperty("user");
      expect(json.data).toHaveProperty("stats");
      expect(json.data).toHaveProperty("recent_ideas");
      expect(json.data).toHaveProperty("recent_builds");

      expect(json.data.user).toHaveProperty("fid");
      expect(json.data.user).toHaveProperty("streak");

      // Private fields should be redacted for non-owners
      expect(json.data.user).not.toHaveProperty("balance");
      expect(json.data.stats).not.toHaveProperty("total_funded");
      expect(json.data.stats).not.toHaveProperty("total_earnings");
      expect(json.data).not.toHaveProperty("recent_funding");
      expect(json.data).not.toHaveProperty("recent_payouts");
    });

    it("should include user stats", async () => {
      // Get a known user
      const ideasRes = await fetch(`${API_BASE}/api/ideas`);
      const ideasJson = await ideasRes.json();

      const ideaWithSubmitter = ideasJson.data.find(
        (i: { submitter_fid: number | null }) => i.submitter_fid
      );

      if (!ideaWithSubmitter) return;

      const res = await fetch(
        `${API_BASE}/api/users/${ideaWithSubmitter.submitter_fid}`
      );
      const json = await res.json();

      expect(json.data.stats).toHaveProperty("ideas_submitted");
      expect(json.data.stats).toHaveProperty("approved_builds");
      expect(json.data.stats).toHaveProperty("current_streak");
    });

    it("should include private fields for profile owner", async () => {
      if (!AUTH_TOKEN || !AUTH_FID) {
        console.log("Skipping private profile test - auth token or fid not configured");
        return;
      }

      const res = await fetch(`${API_BASE}/api/users/${AUTH_FID}`, {
        headers: AUTH_HEADERS,
      });

      if (res.status === 401) {
        console.log("Skipping private profile test - auth rejected");
        return;
      }

      if (res.status === 404) {
        console.log("Skipping private profile test - user not found");
        return;
      }

      expect(res.ok).toBe(true);
      const json = await res.json();

      expect(json.data.user).toHaveProperty("balance");
      expect(json.data.stats).toHaveProperty("total_funded");
      expect(json.data.stats).toHaveProperty("total_earnings");
      expect(json.data).toHaveProperty("recent_funding");
      expect(json.data).toHaveProperty("recent_payouts");
    });
  });
});

describe("API: /api/leaderboard", () => {
  describe("GET /api/leaderboard", () => {
    it("should return builders leaderboard by default", async () => {
      const res = await fetch(`${API_BASE}/api/leaderboard`);

      expect(res.ok).toBe(true);
      const json = await res.json();

      expect(json).toHaveProperty("data");
      expect(json).toHaveProperty("type");
      expect(json.type).toBe("builders");
      expect(Array.isArray(json.data)).toBe(true);
    });

    it("should return builders leaderboard explicitly", async () => {
      const res = await fetch(`${API_BASE}/api/leaderboard?type=builders`);

      expect(res.ok).toBe(true);
      const json = await res.json();

      expect(json.type).toBe("builders");

      if (json.data.length > 0) {
        const builder = json.data[0];
        expect(builder).toHaveProperty("rank");
        expect(builder).toHaveProperty("fid");
        expect(builder).toHaveProperty("name");
        expect(builder).toHaveProperty("claimed");
        expect(builder).toHaveProperty("earned");
        expect(builder).toHaveProperty("streak");
      }
    });

    it("should return submitters leaderboard", async () => {
      const res = await fetch(`${API_BASE}/api/leaderboard?type=submitters`);

      expect(res.ok).toBe(true);
      const json = await res.json();

      expect(json.type).toBe("submitters");

      if (json.data.length > 0) {
        const submitter = json.data[0];
        expect(submitter).toHaveProperty("rank");
        expect(submitter).toHaveProperty("fid");
        expect(submitter).toHaveProperty("name");
        expect(submitter).toHaveProperty("ideas");
        expect(submitter).toHaveProperty("earnings");
      }
    });

    it("should reject invalid type", async () => {
      const res = await fetch(`${API_BASE}/api/leaderboard?type=invalid`);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Invalid type");
    });

    it("should respect limit parameter", async () => {
      const res = await fetch(`${API_BASE}/api/leaderboard?type=submitters&limit=5`);

      expect(res.ok).toBe(true);
      const json = await res.json();

      expect(json.data.length).toBeLessThanOrEqual(5);
    });
  });
});
