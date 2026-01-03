import { describe, it, expect } from "vitest";

// Note: These are integration tests that require the dev server to be running
// POST endpoints require authentication, so tests check for 400 OR 401

const API_BASE = process.env.TEST_API_URL || "http://localhost:3000";

describe("API: /api/builds", () => {
  describe("POST /api/builds", () => {
    it("should reject request without required fields", async () => {
      const res = await fetch(`${API_BASE}/api/builds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea_id: 1 }),
      });

      // Either 400 (missing fields) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });

    it("should reject build for non-existent idea", async () => {
      const res = await fetch(`${API_BASE}/api/builds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea_id: 99999,
          builder_fid: 12345,
          url: "https://example.com/build",
        }),
      });

      // Either 404 (not found) or 401 (no auth)
      expect([401, 404]).toContain(res.status);
    });

    it("should reject build for completed idea", async () => {
      // Get an idea that's completed or already_exists
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();

      const closedIdea = listJson.data.find(
        (i: { status: string }) => i.status === "completed" || i.status === "already_exists"
      );

      if (!closedIdea) {
        console.log("No completed/already_exists idea found, skipping test");
        return;
      }

      const res = await fetch(`${API_BASE}/api/builds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea_id: closedIdea.id,
          builder_fid: 12345,
          url: "https://example.com/build",
        }),
      });

      // Either 400 (idea closed) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });
  });

  describe("GET /api/builds", () => {
    it("should return builds list", async () => {
      const res = await fetch(`${API_BASE}/api/builds`);

      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(json).toHaveProperty("data");
      expect(Array.isArray(json.data)).toBe(true);
    });

    it("should filter by idea_id", async () => {
      // Get an idea ID
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();
      if (listJson.data.length === 0) return;

      const ideaId = listJson.data[0].id;
      const res = await fetch(`${API_BASE}/api/builds?idea_id=${ideaId}`);

      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(Array.isArray(json.data)).toBe(true);

      // All builds should be for this idea
      for (const build of json.data) {
        expect(build.idea_id).toBe(ideaId);
      }
    });

    it("should include builder and idea info", async () => {
      const res = await fetch(`${API_BASE}/api/builds`);
      const json = await res.json();

      if (json.data.length > 0) {
        const build = json.data[0];
        expect(build).toHaveProperty("builder_name");
        expect(build).toHaveProperty("idea_title");
        expect(build).toHaveProperty("status");
        expect(build).toHaveProperty("url");
      }
    });
  });
});

describe("API: /api/builds/[id]", () => {
  describe("GET /api/builds/[id]", () => {
    it("should return 404 for non-existent build", async () => {
      const res = await fetch(
        `${API_BASE}/api/builds/00000000-0000-0000-0000-000000000000`
      );
      expect(res.status).toBe(404);
    });

    it("should return build details", async () => {
      // Get a build ID
      const listRes = await fetch(`${API_BASE}/api/builds`);
      const listJson = await listRes.json();

      if (listJson.data.length === 0) {
        console.log("No builds found, skipping test");
        return;
      }

      const buildId = listJson.data[0].id;
      const res = await fetch(`${API_BASE}/api/builds/${buildId}`);

      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(json.data).toHaveProperty("id");
      expect(json.data).toHaveProperty("builder");
      expect(json.data).toHaveProperty("idea");
      expect(json.data).toHaveProperty("voting");
    });
  });
});

describe("API: /api/builds/[id]/vote", () => {
  describe("POST /api/builds/[id]/vote", () => {
    it("should reject vote for non-existent build", async () => {
      const res = await fetch(
        `${API_BASE}/api/builds/00000000-0000-0000-0000-000000000000/vote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voter_fid: 12345, approved: true }),
        }
      );

      // Either 404 (not found) or 401 (no auth)
      expect([401, 404]).toContain(res.status);
    });

    it("should reject vote without required fields", async () => {
      // Get a build ID
      const listRes = await fetch(`${API_BASE}/api/builds`);
      const listJson = await listRes.json();

      if (listJson.data.length === 0) {
        console.log("No builds found, skipping test");
        return;
      }

      const buildId = listJson.data[0].id;
      const res = await fetch(`${API_BASE}/api/builds/${buildId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voter_fid: 12345 }),
      });

      // Either 400 (missing fields) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });
  });

  describe("GET /api/builds/[id]/vote", () => {
    it("should require voter_fid param", async () => {
      // Get a build ID
      const listRes = await fetch(`${API_BASE}/api/builds`);
      const listJson = await listRes.json();

      if (listJson.data.length === 0) return;

      const buildId = listJson.data[0].id;
      const res = await fetch(`${API_BASE}/api/builds/${buildId}/vote`);

      expect(res.status).toBe(400);
    });

    it("should return vote status", async () => {
      // Get a build ID
      const listRes = await fetch(`${API_BASE}/api/builds`);
      const listJson = await listRes.json();

      if (listJson.data.length === 0) return;

      const buildId = listJson.data[0].id;
      const res = await fetch(
        `${API_BASE}/api/builds/${buildId}/vote?voter_fid=12345`
      );

      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(json).toHaveProperty("has_voted");
      expect(typeof json.has_voted).toBe("boolean");
    });
  });
});

describe("API: /api/builds/[id]/approve", () => {
  describe("POST /api/builds/[id]/approve", () => {
    it("should require admin authentication", async () => {
      const res = await fetch(
        `${API_BASE}/api/builds/00000000-0000-0000-0000-000000000000/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      expect(res.status).toBe(401);
    });
  });
});
