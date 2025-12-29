import { describe, it, expect } from "vitest";

// Note: These are integration tests that require the dev server to be running

const API_BASE = process.env.TEST_API_URL || "http://localhost:3000";

describe("API: Admin Endpoints", () => {
  describe("GET /api/admin/stats", () => {
    it("should require admin authentication", async () => {
      const res = await fetch(`${API_BASE}/api/admin/stats`);
      expect(res.status).toBe(401);
    });

    it("should reject invalid admin key", async () => {
      const res = await fetch(`${API_BASE}/api/admin/stats`, {
        headers: { "x-admin-key": "invalid-key" },
      });
      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /api/admin/ideas/[id]", () => {
    it("should require admin authentication", async () => {
      const res = await fetch(`${API_BASE}/api/admin/ideas/1`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated" }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("DELETE /api/admin/ideas/[id]", () => {
    it("should require admin authentication", async () => {
      const res = await fetch(`${API_BASE}/api/admin/ideas/1`, {
        method: "DELETE",
      });
      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /api/admin/builds/[id]", () => {
    it("should require admin authentication", async () => {
      const res = await fetch(
        `${API_BASE}/api/admin/builds/00000000-0000-0000-0000-000000000000`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "approved" }),
        }
      );
      expect(res.status).toBe(401);
    });
  });

  describe("DELETE /api/admin/builds/[id]", () => {
    it("should require admin authentication", async () => {
      const res = await fetch(
        `${API_BASE}/api/admin/builds/00000000-0000-0000-0000-000000000000`,
        {
          method: "DELETE",
        }
      );
      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /api/admin/users/[fid]", () => {
    it("should require admin authentication", async () => {
      const res = await fetch(`${API_BASE}/api/admin/users/12345`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balance: 100 }),
      });
      expect(res.status).toBe(401);
    });

    it("should reject invalid FID", async () => {
      const res = await fetch(`${API_BASE}/api/admin/users/invalid`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": "test-key",
        },
        body: JSON.stringify({ balance: 100 }),
      });
      // Either 400 (invalid FID) or 401 (auth failed)
      expect([400, 401]).toContain(res.status);
    });
  });

  describe("POST /api/admin/users/[fid] (credit)", () => {
    it("should require admin authentication", async () => {
      const res = await fetch(`${API_BASE}/api/admin/users/12345`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 50, reason: "Test credit" }),
      });
      expect(res.status).toBe(401);
    });
  });
});
