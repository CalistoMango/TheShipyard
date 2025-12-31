import { describe, it, expect } from "vitest";

// Note: These are integration tests that require the dev server to be running

const API_BASE = process.env.TEST_API_URL || "http://localhost:3000";

describe("API: /api/ideas/[id]/refund-signature", () => {
  describe("POST /api/ideas/[id]/refund-signature", () => {
    it("should reject request without user_fid", async () => {
      const res = await fetch(`${API_BASE}/api/ideas/1/refund-signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: "0x1234567890123456789012345678901234567890" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("user_fid");
    });

    it("should reject request without valid recipient address", async () => {
      const res = await fetch(`${API_BASE}/api/ideas/1/refund-signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_fid: 12345, recipient: "invalid" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("recipient");
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

      expect(res.status).toBe(404);
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

      // Either 400 (not eligible) or 400 (no funding) is acceptable
      expect(res.status).toBe(400);
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

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("user_fid");
    });

    it("should reject request without valid recipient address", async () => {
      const res = await fetch(`${API_BASE}/api/claim-reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_fid: 12345, recipient: "invalid" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("recipient");
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

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("No rewards");
    });
  });
});
