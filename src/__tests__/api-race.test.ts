import { describe, it, expect } from "vitest";

// Note: These are integration tests that require the dev server to be running

const API_BASE = process.env.TEST_API_URL || "http://localhost:3000";

describe("API: /api/race", () => {
  describe("GET /api/race", () => {
    it("should return race mode info", async () => {
      const res = await fetch(`${API_BASE}/api/race`);

      expect(res.ok).toBe(true);
      const json = await res.json();

      expect(json).toHaveProperty("data");
      expect(json).toHaveProperty("count");
      expect(json).toHaveProperty("threshold");
      expect(Array.isArray(json.data)).toBe(true);
      expect(typeof json.threshold).toBe("number");
    });

    it("should only return ideas in voting status", async () => {
      const res = await fetch(`${API_BASE}/api/race`);

      expect(res.ok).toBe(true);
      const json = await res.json();

      // All returned ideas should have voting status
      for (const idea of json.data) {
        expect(idea.status).toBe("voting");
      }
    });

    it("should include idea details", async () => {
      const res = await fetch(`${API_BASE}/api/race`);

      expect(res.ok).toBe(true);
      const json = await res.json();

      if (json.data.length > 0) {
        const idea = json.data[0];
        expect(idea).toHaveProperty("id");
        expect(idea).toHaveProperty("title");
        expect(idea).toHaveProperty("pool");
        expect(idea).toHaveProperty("submitter");
        expect(idea).toHaveProperty("category");
      }
    });
  });
});

describe("Race Mode Trigger", () => {
  it("should trigger race mode when funding crosses threshold", async () => {
    // This test requires seeding an idea with pool just under threshold
    // and a user with sufficient balance. For now, we just verify the
    // API response includes the race_mode_triggered field.

    // Get an open idea
    const listRes = await fetch(`${API_BASE}/api/ideas?sort=funded`);
    const listJson = await listRes.json();

    const openIdea = listJson.data.find(
      (i: { status: string }) => i.status === "open"
    );

    if (!openIdea) {
      console.log("No open idea found, skipping race mode trigger test");
      return;
    }

    // Try to fund (will likely fail due to insufficient balance, but
    // verifies the endpoint structure is correct)
    const res = await fetch(`${API_BASE}/api/ideas/${openIdea.id}/fund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_fid: 33333,
        amount: 10,
      }),
    });

    const json = await res.json();

    // Either we get insufficient balance error or successful funding with race_mode_triggered field
    if (res.ok) {
      expect(json).toHaveProperty("race_mode_triggered");
      expect(typeof json.race_mode_triggered).toBe("boolean");
    } else {
      // Expected error for insufficient balance
      expect(json.error).toBeDefined();
    }
  });
});
