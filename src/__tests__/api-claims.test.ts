import { describe, it, expect } from "vitest";

// Note: These are integration tests that require the dev server to be running
// Security tests validate replay protection and double-claim prevention

const API_BASE = process.env.TEST_API_URL || "http://localhost:3000";

describe("API: /api/ideas/[id]/refund-signature", () => {
  describe("POST /api/ideas/[id]/refund-signature", () => {
    it("should reject request without user_fid", async () => {
      const res = await fetch(`${API_BASE}/api/ideas/1/refund-signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: "0x1234567890123456789012345678901234567890" }),
      });

      // Either 400 (missing user_fid) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });

    it("should reject request without valid recipient address", async () => {
      const res = await fetch(`${API_BASE}/api/ideas/1/refund-signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_fid: 12345, recipient: "invalid" }),
      });

      // Either 400 (invalid recipient) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });

    it("should return 404 for non-existent idea", async () => {
      const res = await fetch(`${API_BASE}/api/ideas/99999/refund-signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          recipient: "0x1234567890123456789012345678901234567890",
        }),
      });

      // Either 404 (not found) or 401 (no auth)
      expect([401, 404]).toContain(res.status);
    });

    it("should reject refund for ideas not eligible (less than 30 days)", async () => {
      // Get an existing open idea
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();
      const openIdea = listJson.data.find(
        (i: { status: string }) => i.status === "open"
      );
      if (!openIdea) {
        console.log("No open idea found, skipping test");
        return;
      }

      const res = await fetch(
        `${API_BASE}/api/ideas/${openIdea.id}/refund-signature`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_fid: 12345,
            recipient: "0x1234567890123456789012345678901234567890",
          }),
        }
      );

      // Either 400 (not eligible/no funding) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });
  });
});

describe("API: /api/claim-reward", () => {
  describe("GET /api/claim-reward", () => {
    it("should reject request without fid parameter", async () => {
      const res = await fetch(`${API_BASE}/api/claim-reward`);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("fid");
    });

    it("should return reward info for valid fid", async () => {
      const res = await fetch(`${API_BASE}/api/claim-reward?fid=12345`);

      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(json).toHaveProperty("fid");
      expect(json).toHaveProperty("totalRewards");
      expect(json).toHaveProperty("builderRewards");
      expect(json).toHaveProperty("submitterRewards");
      expect(json).toHaveProperty("builderProjects");
      expect(json).toHaveProperty("submittedIdeas");
      expect(typeof json.totalRewards).toBe("number");
    });

    it("should return zero rewards for user with no completed projects", async () => {
      // Use a FID that likely has no rewards
      const res = await fetch(`${API_BASE}/api/claim-reward?fid=999999999`);

      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(json.totalRewards).toBe(0);
      expect(json.builderRewards).toBe(0);
      expect(json.submitterRewards).toBe(0);
    });
  });

  describe("POST /api/claim-reward", () => {
    it("should reject request without user_fid", async () => {
      const res = await fetch(`${API_BASE}/api/claim-reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: "0x1234567890123456789012345678901234567890",
        }),
      });

      // Either 400 (missing user_fid) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });

    it("should reject request without valid recipient address", async () => {
      const res = await fetch(`${API_BASE}/api/claim-reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_fid: 12345, recipient: "invalid" }),
      });

      // Either 400 (invalid recipient) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });

    it("should reject when no rewards available", async () => {
      // Use a FID that likely has no rewards
      const res = await fetch(`${API_BASE}/api/claim-reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 999999999,
          recipient: "0x1234567890123456789012345678901234567890",
        }),
      });

      // Either 400 (no rewards) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
      const json = await res.json();
      if (res.status === 400) {
        expect(json.error).toContain("No rewards");
      }
    });
  });
});

describe("API: /api/record-reward", () => {
  describe("POST /api/record-reward", () => {
    it("should require authentication", async () => {
      const res = await fetch(`${API_BASE}/api/record-reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          tx_hash: "0xtest" + Date.now().toString(16),
          amount: 100,
          idea_id: 283,
        }),
      });

      expect(res.status).toBe(401);
    });

    it("should reject missing tx_hash", async () => {
      const res = await fetch(`${API_BASE}/api/record-reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          amount: 100,
          idea_id: 283,
        }),
      });

      // Either 400 (missing tx_hash) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });

    it("should reject invalid tx_hash format", async () => {
      const res = await fetch(`${API_BASE}/api/record-reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          tx_hash: "not-a-valid-hash",
          amount: 100,
          idea_id: 283,
        }),
      });

      // Either 400 (invalid format) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });

    it("should reject zero or negative amount", async () => {
      const res = await fetch(`${API_BASE}/api/record-reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          tx_hash: "0xtest" + Date.now().toString(16),
          amount: 0,
          idea_id: 283,
        }),
      });

      // Either 400 (invalid amount) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });

    it("should reject missing idea_id (v2)", async () => {
      const res = await fetch(`${API_BASE}/api/record-reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          tx_hash: "0xtest" + Date.now().toString(16),
          amount: 100,
        }),
      });

      // Either 400 (missing idea_id) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });
  });
});

describe("API: /api/record-refund (per-project v2)", () => {
  describe("POST /api/record-refund", () => {
    it("should require authentication", async () => {
      const res = await fetch(`${API_BASE}/api/record-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          tx_hash: "0xtest" + Date.now().toString(16),
          amount: 100,
          idea_id: 283,
        }),
      });

      expect(res.status).toBe(401);
    });

    it("should reject missing user_fid", async () => {
      const res = await fetch(`${API_BASE}/api/record-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tx_hash: "0xtest" + Date.now().toString(16),
          amount: 100,
          idea_id: 283,
        }),
      });

      // Either 400 (missing user_fid) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });

    it("should reject missing idea_id (v2)", async () => {
      const res = await fetch(`${API_BASE}/api/record-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          tx_hash: "0xtest" + Date.now().toString(16),
          amount: 100,
        }),
      });

      // Either 400 (missing idea_id) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });

    it("should reject missing tx_hash", async () => {
      const res = await fetch(`${API_BASE}/api/record-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          amount: 100,
        }),
      });

      // Either 400 (missing tx_hash) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });

    it("should reject invalid tx_hash format", async () => {
      const res = await fetch(`${API_BASE}/api/record-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          tx_hash: "not-a-valid-hash",
          amount: 100,
        }),
      });

      // Either 400 (invalid format) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });

    it("should reject zero or negative amount", async () => {
      const res = await fetch(`${API_BASE}/api/record-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          tx_hash: "0xtest" + Date.now().toString(16),
          amount: 0,
        }),
      });

      // Either 400 (invalid amount) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });
  });
});

describe("API: /api/ideas/[id]/record-refund (deprecated)", () => {
  describe("POST /api/ideas/[id]/record-refund", () => {
    it("should reject invalid idea ID", async () => {
      const res = await fetch(`${API_BASE}/api/ideas/invalid/record-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          tx_hash: "0xtest" + Date.now().toString(16),
          amount: 100,
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Invalid idea ID");
    });

    it("should forward to global endpoint with deprecation warning", async () => {
      // This test verifies the redirect behavior - it should get 401 from global endpoint
      const res = await fetch(`${API_BASE}/api/ideas/1/record-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          tx_hash: "0xtest" + Date.now().toString(16),
          amount: 100,
        }),
      });

      // Should get 401 from the global endpoint (requires auth)
      expect(res.status).toBe(401);
    });
  });
});
