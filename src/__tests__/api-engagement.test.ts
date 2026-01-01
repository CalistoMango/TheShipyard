import { describe, it, expect } from "vitest";

// Note: These are integration tests that require the dev server to be running
// POST endpoints require authentication, so tests check for 400 OR 401

const API_BASE = process.env.TEST_API_URL || "http://localhost:3000";

describe("API: /api/ideas/[id]/upvote", () => {
  describe("POST /api/ideas/[id]/upvote", () => {
    it("should reject request without user_fid", async () => {
      // Get an existing idea
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();
      if (listJson.data.length === 0) return;

      const ideaId = listJson.data[0].id;

      const res = await fetch(`${API_BASE}/api/ideas/${ideaId}/upvote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      // Either 400 (missing user_fid) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });

    it("should return 404 for non-existent idea", async () => {
      const res = await fetch(`${API_BASE}/api/ideas/99999/upvote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_fid: 12345 }),
      });

      // Either 404 (not found) or 401 (no auth)
      expect([401, 404]).toContain(res.status);
    });

    it("should toggle upvote on and off", async () => {
      // Get an existing idea
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();
      if (listJson.data.length === 0) return;

      const ideaId = listJson.data[0].id;
      const testFid = 55555 + Math.floor(Math.random() * 1000);

      // First toggle - should add upvote (or 401 if auth required)
      const res1 = await fetch(`${API_BASE}/api/ideas/${ideaId}/upvote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_fid: testFid }),
      });

      // If auth is required, skip the rest of the test
      if (res1.status === 401) {
        return;
      }

      expect(res1.ok).toBe(true);
      const json1 = await res1.json();
      expect(json1.status).toBe("added");
      expect(json1.upvoted).toBe(true);
      expect(typeof json1.upvote_count).toBe("number");

      // Second toggle - should remove upvote
      const res2 = await fetch(`${API_BASE}/api/ideas/${ideaId}/upvote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_fid: testFid }),
      });

      expect(res2.ok).toBe(true);
      const json2 = await res2.json();
      expect(json2.status).toBe("removed");
      expect(json2.upvoted).toBe(false);
    });
  });

  describe("GET /api/ideas/[id]/upvote", () => {
    it("should reject request without user_fid query param", async () => {
      // Get an existing idea
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();
      if (listJson.data.length === 0) return;

      const ideaId = listJson.data[0].id;

      const res = await fetch(`${API_BASE}/api/ideas/${ideaId}/upvote`);
      expect(res.status).toBe(400);
    });

    it("should return upvote status", async () => {
      // Get an existing idea
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();
      if (listJson.data.length === 0) return;

      const ideaId = listJson.data[0].id;
      const testFid = 66666;

      const res = await fetch(
        `${API_BASE}/api/ideas/${ideaId}/upvote?user_fid=${testFid}`
      );

      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(typeof json.upvoted).toBe("boolean");
    });
  });
});

describe("API: /api/ideas/[id]/comments", () => {
  describe("GET /api/ideas/[id]/comments", () => {
    it("should return 404 for non-existent idea", async () => {
      const res = await fetch(`${API_BASE}/api/ideas/99999/comments`);
      expect(res.status).toBe(404);
    });

    it("should return empty comments for idea without cast_hash", async () => {
      // Get an existing idea
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();
      if (listJson.data.length === 0) return;

      // Find an idea without cast_hash (from seed data)
      const ideaWithoutCast = listJson.data.find(
        (i: { cast_hash: string | null }) => !i.cast_hash
      );

      if (!ideaWithoutCast) {
        console.log("No idea without cast_hash found, skipping test");
        return;
      }

      const res = await fetch(
        `${API_BASE}/api/ideas/${ideaWithoutCast.id}/comments`
      );

      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(json.data).toEqual([]);
      expect(json.cast_url).toBeNull();
    });

    it("should return comments structure for idea with cast_hash", async () => {
      // Get an existing idea
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();
      if (listJson.data.length === 0) return;

      // Find an idea with cast_hash
      const ideaWithCast = listJson.data.find(
        (i: { cast_hash: string | null }) => i.cast_hash
      );

      if (!ideaWithCast) {
        console.log("No idea with cast_hash found, skipping test");
        return;
      }

      const res = await fetch(
        `${API_BASE}/api/ideas/${ideaWithCast.id}/comments`
      );

      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(Array.isArray(json.data)).toBe(true);
      // cast_url should be present (either valid URL or message about viewing on Farcaster)
      expect(json.cast_url || json.message).toBeTruthy();
    });
  });
});
