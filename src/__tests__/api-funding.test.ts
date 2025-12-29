import { describe, it, expect } from "vitest";

// Note: These are integration tests that require the dev server to be running

const API_BASE = process.env.TEST_API_URL || "http://localhost:3000";

describe("API: /api/ideas/[id]/fund", () => {
  describe("POST /api/ideas/[id]/fund", () => {
    it("should reject request without user_fid", async () => {
      // Get an existing idea
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();
      if (listJson.data.length === 0) return;

      const ideaId = listJson.data[0].id;

      const res = await fetch(`${API_BASE}/api/ideas/${ideaId}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 10 }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("user_fid");
    });

    it("should reject funding below minimum amount", async () => {
      // Get an existing idea
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();
      if (listJson.data.length === 0) return;

      const ideaId = listJson.data[0].id;

      const res = await fetch(`${API_BASE}/api/ideas/${ideaId}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_fid: 12345, amount: 0.5 }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Minimum");
    });

    it("should return 404 for non-existent idea", async () => {
      const res = await fetch(`${API_BASE}/api/ideas/99999/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_fid: 12345, amount: 10 }),
      });

      expect(res.status).toBe(404);
    });

    it("should reject funding for insufficient balance", async () => {
      // Get an existing idea
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();
      if (listJson.data.length === 0) return;

      // Find an open idea
      const openIdea = listJson.data.find(
        (i: { status: string }) => i.status === "open"
      );
      if (!openIdea) {
        console.log("No open idea found, skipping test");
        return;
      }

      const res = await fetch(`${API_BASE}/api/ideas/${openIdea.id}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 44444,
          amount: 1000000, // More than any balance
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Insufficient balance");
    });
  });

  describe("GET /api/ideas/[id]/fund", () => {
    it("should return 404 for non-existent idea", async () => {
      const res = await fetch(`${API_BASE}/api/ideas/99999/fund`);
      expect(res.status).toBe(404);
    });

    it("should return funding history", async () => {
      // Get an existing idea
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();
      if (listJson.data.length === 0) return;

      const ideaId = listJson.data[0].id;

      const res = await fetch(`${API_BASE}/api/ideas/${ideaId}/fund`);

      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(json.data).toHaveProperty("pool");
      expect(json.data).toHaveProperty("total_funders");
      expect(json.data).toHaveProperty("funding_history");
      expect(Array.isArray(json.data.funding_history)).toBe(true);
    });

    it("should include user info in funding history", async () => {
      // Get an existing idea with funding
      const listRes = await fetch(`${API_BASE}/api/ideas?sort=funded`);
      const listJson = await listRes.json();

      // Find an idea with funding
      const fundedIdea = listJson.data.find((i: { pool: number }) => i.pool > 0);
      if (!fundedIdea) {
        console.log("No funded idea found, skipping test");
        return;
      }

      const res = await fetch(`${API_BASE}/api/ideas/${fundedIdea.id}/fund`);

      expect(res.ok).toBe(true);
      const json = await res.json();

      if (json.data.funding_history.length > 0) {
        const entry = json.data.funding_history[0];
        expect(entry).toHaveProperty("user");
        expect(entry).toHaveProperty("user_fid");
        expect(entry).toHaveProperty("amount");
        expect(entry).toHaveProperty("created_at");
      }
    });
  });
});
