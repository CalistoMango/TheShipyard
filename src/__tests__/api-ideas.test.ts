import { describe, it, expect } from "vitest";

// Note: These are integration tests that require the dev server to be running
// and the database to be seeded

const API_BASE = process.env.TEST_API_URL || "http://localhost:3000";

describe("API: /api/ideas", () => {
  describe("GET /api/ideas", () => {
    it("should return a list of ideas", async () => {
      const res = await fetch(`${API_BASE}/api/ideas`);
      expect(res.ok).toBe(true);

      const json = await res.json();
      expect(json).toHaveProperty("data");
      expect(json).toHaveProperty("total");
      expect(json).toHaveProperty("page");
      expect(json).toHaveProperty("pageSize");
      expect(Array.isArray(json.data)).toBe(true);
    });

    it("should filter by category", async () => {
      const res = await fetch(`${API_BASE}/api/ideas?category=tools`);
      expect(res.ok).toBe(true);

      const json = await res.json();
      expect(Array.isArray(json.data)).toBe(true);

      // All returned ideas should be in "tools" category
      for (const idea of json.data) {
        expect(idea.category).toBe("tools");
      }
    });

    it("should sort by pool (funded)", async () => {
      const res = await fetch(`${API_BASE}/api/ideas?sort=funded`);
      expect(res.ok).toBe(true);

      const json = await res.json();
      expect(Array.isArray(json.data)).toBe(true);

      // Ideas should be sorted by pool descending
      for (let i = 1; i < json.data.length; i++) {
        expect(json.data[i - 1].pool).toBeGreaterThanOrEqual(json.data[i].pool);
      }
    });

    it("should sort by upvotes", async () => {
      const res = await fetch(`${API_BASE}/api/ideas?sort=upvoted`);
      expect(res.ok).toBe(true);

      const json = await res.json();
      expect(Array.isArray(json.data)).toBe(true);

      // Ideas should be sorted by upvotes descending
      for (let i = 1; i < json.data.length; i++) {
        expect(json.data[i - 1].upvotes).toBeGreaterThanOrEqual(json.data[i].upvotes);
      }
    });

    it("should include submitter name", async () => {
      const res = await fetch(`${API_BASE}/api/ideas`);
      const json = await res.json();

      if (json.data.length > 0) {
        const idea = json.data[0];
        expect(idea).toHaveProperty("submitter");
        expect(typeof idea.submitter).toBe("string");
      }
    });
  });

  describe("GET /api/ideas/[id]", () => {
    it("should return idea detail with funding history", async () => {
      // First get an idea ID
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();

      if (listJson.data.length === 0) {
        console.log("No ideas in database, skipping detail test");
        return;
      }

      const ideaId = listJson.data[0].id;
      const res = await fetch(`${API_BASE}/api/ideas/${ideaId}`);
      expect(res.ok).toBe(true);

      const json = await res.json();
      expect(json).toHaveProperty("data");
      expect(json.data).toHaveProperty("idea");
      expect(json.data).toHaveProperty("fundingHistory");
      expect(json.data).toHaveProperty("totalFunders");

      expect(json.data.idea.id).toBe(ideaId);
    });

    it("should return 404 for non-existent idea", async () => {
      const res = await fetch(`${API_BASE}/api/ideas/99999`);
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe("Idea not found");
    });

    it("should return 400 for invalid idea ID", async () => {
      const res = await fetch(`${API_BASE}/api/ideas/invalid`);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe("Invalid idea ID");
    });
  });
});
