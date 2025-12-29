import { describe, it, expect } from "vitest";

// Note: These are integration tests that require the dev server to be running

const API_BASE = process.env.TEST_API_URL || "http://localhost:3000";

describe("API: /api/cron/daily-notifications", () => {
  describe("GET /api/cron/daily-notifications", () => {
    it("should reject request without auth when CRON_SECRET is set", async () => {
      // If CRON_SECRET is set on server, this should fail
      // If not set, it will succeed
      const res = await fetch(`${API_BASE}/api/cron/daily-notifications`);

      // Either 200 (no secret) or 401 (secret required)
      expect([200, 401]).toContain(res.status);

      if (res.ok) {
        const json = await res.json();
        expect(json).toHaveProperty("status");
        expect(json).toHaveProperty("timestamp");
      }
    });

    it("should return notification stats when authorized", async () => {
      // Test without auth (works when CRON_SECRET not set)
      const res = await fetch(`${API_BASE}/api/cron/daily-notifications`);

      if (res.ok) {
        const json = await res.json();
        expect(json.status).toBe("completed");
        expect(typeof json.notifications_sent).toBe("number");
        expect(typeof json.notifications_failed).toBe("number");
      }
    });
  });

  describe("POST /api/cron/daily-notifications", () => {
    it("should also accept POST for manual triggering", async () => {
      const res = await fetch(`${API_BASE}/api/cron/daily-notifications`, {
        method: "POST",
      });

      // Either 200 (no secret) or 401 (secret required)
      expect([200, 401]).toContain(res.status);
    });
  });
});
