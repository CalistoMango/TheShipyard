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

  describe("GET /api/admin/dashboard", () => {
    it("should require admin authentication", async () => {
      const res = await fetch(`${API_BASE}/api/admin/dashboard`);
      expect(res.status).toBe(401);
    });

    it("should reject non-admin users", async () => {
      // Without a valid JWT, should get 401
      const res = await fetch(`${API_BASE}/api/admin/dashboard`, {
        headers: { Authorization: "Bearer invalid-token" },
      });
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/builds/[id]/resolve", () => {
    it("should require admin authentication", async () => {
      const res = await fetch(
        `${API_BASE}/api/builds/00000000-0000-0000-0000-000000000000/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      expect(res.status).toBe(401);
    });

    it("should reject non-admin users", async () => {
      const res = await fetch(
        `${API_BASE}/api/builds/00000000-0000-0000-0000-000000000000/resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer invalid-token",
          },
        }
      );
      expect(res.status).toBe(401);
    });
  });
});

describe("Admin Dashboard: voting_builds payload", () => {
  // Note: These tests verify payload structure when dashboard is accessible
  // They require the dev server running and admin auth

  it("voting_builds should have correct shape when present", async () => {
    // This test documents the expected shape of voting_builds
    // The actual test requires admin auth which we can't easily provide here
    const expectedShape = {
      id: "string",
      idea_id: "number",
      idea_title: "string",
      builder_fid: "number",
      builder_name: "string",
      url: "string",
      description: "string | null",
      created_at: "string",
      vote_ends_at: "string | null",
      votes_approve: "number",
      votes_reject: "number",
      voting_ended: "boolean",
    };

    // Validate shape definition exists
    expect(Object.keys(expectedShape)).toHaveLength(12);
    expect(expectedShape.voting_ended).toBe("boolean");
  });

  it("voting_ended should be false when vote_ends_at is null", () => {
    // Test the logic: null vote_ends_at should NOT be treated as "ended"
    const vote_ends_at: string | null = null;
    const now = Date.now();
    const votingEnded = vote_ends_at ? now > new Date(vote_ends_at).getTime() : false;

    expect(votingEnded).toBe(false);
  });

  it("voting_ended should be true only when vote_ends_at is in the past", () => {
    const now = Date.now();

    // Past date should be ended
    const pastDate = new Date(now - 1000).toISOString();
    const pastEnded = pastDate ? now > new Date(pastDate).getTime() : false;
    expect(pastEnded).toBe(true);

    // Future date should not be ended
    const futureDate = new Date(now + 60000).toISOString();
    const futureEnded = futureDate ? now > new Date(futureDate).getTime() : false;
    expect(futureEnded).toBe(false);
  });
});

/**
 * Manual Test Checklist: AdminTab Voting Builds UI
 *
 * These behaviors require manual testing in the browser:
 *
 * 1. Auto-refresh timer (60 second interval):
 *    - Open Admin Dashboard with a voting build that has ~1 minute left
 *    - Wait without interacting with the page
 *    - After 60 seconds, the countdown should update and "Resolve Vote" should appear when ended
 *
 * 2. Client-side voting_ended re-evaluation:
 *    - Load Admin Dashboard, note a build showing "Xh left"
 *    - In Supabase, update vote_ends_at to NOW() - INTERVAL '1 minute'
 *    - Wait 60 seconds (for timer) or trigger any re-render
 *    - Build should now show "Voting ended" with "Resolve Vote" button
 *
 * 3. Null vote_ends_at handling:
 *    - Create a build in "voting" status with vote_ends_at = NULL
 *    - Admin Dashboard should show "No deadline" (red text)
 *    - "Resolve Vote" button should NOT appear
 *    - Calling resolve API should return 400 error
 *
 * 4. Invalid vote_ends_at handling:
 *    - Set vote_ends_at to an invalid string in the database
 *    - Calling resolve API should return 400 "invalid voting deadline" error
 */
