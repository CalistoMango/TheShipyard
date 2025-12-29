import { describe, it, expect } from "vitest";

// Note: These are integration tests that require the dev server to be running

const API_BASE = process.env.TEST_API_URL || "http://localhost:3000";

describe("API: /api/ingest", () => {
  describe("POST /api/ingest", () => {
    it("should reject request with missing required fields", async () => {
      const res = await fetch(`${API_BASE}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cast_hash: "0x123" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Missing required fields");
    });

    it("should reject request with empty cast_text", async () => {
      const res = await fetch(`${API_BASE}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cast_hash: "0x" + Math.random().toString(16).slice(2),
          cast_text: "",
          author_fid: 12345,
        }),
      });

      expect(res.status).toBe(400);
    });

    it("should process a valid cast with idea content", async () => {
      // Use a unique hash to avoid duplicate detection
      const uniqueHash = "0xtest" + Date.now().toString(16);

      const res = await fetch(`${API_BASE}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cast_hash: uniqueHash,
          cast_text: "Someone build a Farcaster client that shows NFT galleries for each user profile",
          author_fid: 99999,
          author_username: "testuser",
          author_display_name: "Test User",
        }),
      });

      expect(res.ok).toBe(true);
      const json = await res.json();

      // Should be created, rejected, or duplicate
      expect(["created", "rejected", "duplicate"]).toContain(json.status);

      if (json.status === "created") {
        expect(json).toHaveProperty("idea_id");
        expect(json).toHaveProperty("category");
        expect(json).toHaveProperty("title");
      }
    });

    it("should skip already processed cast hash when idea was created", async () => {
      const uniqueHash = "0xdupe" + Date.now().toString(16);

      // First request - use a clear idea pitch that will be accepted
      const res1 = await fetch(`${API_BASE}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cast_hash: uniqueHash,
          cast_text: "Someone build a Farcaster mobile app with push notifications and offline mode support for iOS and Android",
          author_fid: 99998,
          author_username: "dupetest",
        }),
      });

      const json1 = await res1.json();

      // If first was rejected, we can't test duplicate detection
      if (json1.status === "rejected") {
        console.log("First cast was rejected, skipping duplicate test");
        return;
      }

      expect(json1.status).toBe("created");

      // Second request with same hash
      const res2 = await fetch(`${API_BASE}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cast_hash: uniqueHash,
          cast_text: "Someone build a Farcaster mobile app with push notifications and offline mode support for iOS and Android",
          author_fid: 99998,
          author_username: "dupetest",
        }),
      });

      expect(res2.ok).toBe(true);
      const json2 = await res2.json();
      expect(json2.status).toBe("skipped");
      expect(json2.reason).toContain("already processed");
    });

    it("should reject non-idea casts", async () => {
      const uniqueHash = "0xreject" + Date.now().toString(16);

      const res = await fetch(`${API_BASE}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cast_hash: uniqueHash,
          cast_text: "gm everyone! hope you have a great day",
          author_fid: 99997,
          author_username: "gmtest",
        }),
      });

      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(json.status).toBe("rejected");
      expect(json).toHaveProperty("reason");
    });

    it("should create user if not exists", async () => {
      const uniqueHash = "0xnewuser" + Date.now().toString(16);
      const newFid = 88888 + Math.floor(Math.random() * 1000);

      const res = await fetch(`${API_BASE}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cast_hash: uniqueHash,
          cast_text: "Someone build a decentralized social graph explorer for Farcaster",
          author_fid: newFid,
          author_username: "brandnewuser",
          author_display_name: "Brand New User",
        }),
      });

      // Should succeed regardless of whether idea is created or rejected
      expect(res.ok).toBe(true);
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
