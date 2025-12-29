import { describe, it, expect } from "vitest";
import type {
  IdeaStatus,
  BuildStatus,
  Category,
  DbIdea,
  Idea,
} from "~/lib/types";

describe("Types", () => {
  describe("IdeaStatus", () => {
    it("should have valid status values", () => {
      const statuses: IdeaStatus[] = ["open", "voting", "completed"];
      expect(statuses).toHaveLength(3);
    });
  });

  describe("BuildStatus", () => {
    it("should have valid build status values", () => {
      const statuses: BuildStatus[] = ["pending_review", "voting", "approved", "rejected"];
      expect(statuses).toHaveLength(4);
    });
  });

  describe("Category", () => {
    it("should have valid category values", () => {
      const categories: Category[] = ["games", "tools", "social", "defi", "content", "other"];
      expect(categories).toHaveLength(6);
    });
  });

  describe("DbIdea", () => {
    it("should match expected shape", () => {
      const idea: DbIdea = {
        id: 1,
        title: "Test Idea",
        description: "A test idea",
        category: "tools",
        status: "open",
        cast_hash: null,
        related_casts: [],
        submitter_fid: 123,
        pool: 100,
        upvote_count: 10,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      expect(idea.id).toBe(1);
      expect(idea.title).toBe("Test Idea");
      expect(idea.category).toBe("tools");
      expect(idea.status).toBe("open");
    });
  });

  describe("Idea (frontend type)", () => {
    it("should have submitter as string for display", () => {
      const idea: Idea = {
        id: 1,
        title: "Test Idea",
        description: "A test idea",
        category: "tools",
        pool: 100,
        upvotes: 10,
        submitter: "testuser.eth",
        submitter_fid: 123,
        status: "open",
        cast_hash: null,
        created_at: "2025-01-01T00:00:00Z",
      };

      expect(idea.submitter).toBe("testuser.eth");
      expect(typeof idea.submitter).toBe("string");
    });
  });
});
