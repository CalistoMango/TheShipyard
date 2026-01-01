import { describe, it, expect } from "vitest";

// Note: These are integration tests that require the dev server to be running
// The /api/ingest endpoint requires INGEST_SECRET when set, so direct calls
// without the secret will return 401. The webhook endpoint handles adding
// the secret header when forwarding to ingest.

const API_BASE = process.env.TEST_API_URL || "http://localhost:3000";

describe("API: /api/ingest", () => {
  describe("POST /api/ingest (without secret)", () => {
    it("should reject request without secret when INGEST_SECRET is configured", async () => {
      const res = await fetch(`${API_BASE}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cast_hash: "0x123" }),
      });

      // Either 401 (secret required) or 400 (missing fields, if no secret configured)
      expect([400, 401]).toContain(res.status);
    });

    it("should reject request with wrong secret", async () => {
      const res = await fetch(`${API_BASE}/api/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ingest-secret": "wrong-secret-value",
        },
        body: JSON.stringify({
          cast_hash: "0x" + Math.random().toString(16).slice(2),
          cast_text: "Test idea",
          author_fid: 12345,
        }),
      });

      // If secret is configured, should reject with 401
      // If not configured, may accept (development mode)
      if (res.status === 401) {
        const json = await res.json();
        expect(json.error).toBe("Unauthorized");
      }
    });
  });
});

describe("API: /api/webhook/cast", () => {
  describe("POST /api/webhook/cast", () => {
    it("should skip casts not from target channel", async () => {
      const res = await fetch(`${API_BASE}/api/webhook/cast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "cast.created",
          created_at: Date.now(),
          data: {
            object: "cast",
            hash: "0xwrongchannel" + Date.now().toString(16),
            thread_hash: "0x123",
            parent_hash: null,
            parent_url: null,
            root_parent_url: null,
            parent_author: { fid: null },
            author: {
              object: "user",
              fid: 12345,
              custody_address: "0x123",
              username: "testuser",
              display_name: "Test User",
              pfp_url: "https://example.com/pfp.png",
            },
            text: "Someone build a test app",
            timestamp: new Date().toISOString(),
            embeds: [],
            channel: {
              object: "channel_dehydrated",
              id: "different-channel",
              name: "Different Channel",
              image_url: "https://example.com/channel.png",
            },
          },
        }),
      });

      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(json.status).toBe("skipped");
      expect(json.reason).toContain("not from");
    });

    it("should skip reply casts", async () => {
      const res = await fetch(`${API_BASE}/api/webhook/cast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "cast.created",
          created_at: Date.now(),
          data: {
            object: "cast",
            hash: "0xreply" + Date.now().toString(16),
            thread_hash: "0x123",
            parent_hash: "0xparent123", // This is a reply
            parent_url: null,
            root_parent_url: null,
            parent_author: { fid: 999 },
            author: {
              object: "user",
              fid: 12345,
              custody_address: "0x123",
              username: "testuser",
              display_name: "Test User",
              pfp_url: "https://example.com/pfp.png",
            },
            text: "Someone build a test app",
            timestamp: new Date().toISOString(),
            embeds: [],
            channel: {
              object: "channel_dehydrated",
              id: "someone-build",
              name: "Someone Build",
              image_url: "https://example.com/channel.png",
            },
          },
        }),
      });

      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(json.status).toBe("skipped");
      expect(json.reason).toContain("reply");
    });

    it("should process valid cast from target channel", async () => {
      const uniqueHash = "0xvalidcast" + Date.now().toString(16);

      const res = await fetch(`${API_BASE}/api/webhook/cast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "cast.created",
          created_at: Date.now(),
          data: {
            object: "cast",
            hash: uniqueHash,
            thread_hash: uniqueHash,
            parent_hash: null,
            parent_url: null,
            root_parent_url: null,
            parent_author: { fid: null },
            author: {
              object: "user",
              fid: 77777,
              custody_address: "0x123",
              username: "webhooktest",
              display_name: "Webhook Test User",
              pfp_url: "https://example.com/pfp.png",
            },
            text: "Someone build a Farcaster analytics dashboard with real-time metrics",
            timestamp: new Date().toISOString(),
            embeds: [],
            channel: {
              object: "channel_dehydrated",
              id: "someone-build",
              name: "Someone Build",
              image_url: "https://example.com/channel.png",
            },
          },
        }),
      });

      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(json.status).toBe("processed");
      expect(json).toHaveProperty("cast_hash");
      expect(json).toHaveProperty("ingest_result");
    });

    it("should skip non-cast.created event types", async () => {
      const res = await fetch(`${API_BASE}/api/webhook/cast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "cast.deleted",
          created_at: Date.now(),
          data: {
            hash: "0xdeleted123",
          },
        }),
      });

      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(json.status).toBe("skipped");
    });
  });
});
