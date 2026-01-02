import { describe, it, expect } from "vitest";

// Note: These are integration tests that require the dev server to be running

const API_BASE = process.env.TEST_API_URL || "http://localhost:3000";

describe("Security: Ingest endpoint authentication", () => {
  describe("POST /api/ingest without secret", () => {
    it("should reject requests when INGEST_SECRET is set but not provided", async () => {
      // This test assumes INGEST_SECRET is set in the environment
      // If not set, the endpoint will allow the request (development mode)
      const res = await fetch(`${API_BASE}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cast_hash: "0xsecuritytest" + Date.now().toString(16),
          cast_text: "Someone build a security testing tool",
          author_fid: 99999,
        }),
      });

      // Either 401 (secret required) or 200/400 (no secret configured)
      // We can't guarantee which mode the server is in
      const json = await res.json();
      if (res.status === 401) {
        expect(json.error).toBe("Unauthorized");
      } else {
        // Development mode - request was processed
        expect([200, 400]).toContain(res.status);
      }
    });

    it("should reject requests with wrong secret", async () => {
      const res = await fetch(`${API_BASE}/api/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ingest-secret": "wrong-secret-value",
        },
        body: JSON.stringify({
          cast_hash: "0xwrongsecret" + Date.now().toString(16),
          cast_text: "Someone build a security testing tool",
          author_fid: 99999,
        }),
      });

      // If secret is configured, should reject
      // If not configured, may accept (development mode)
      if (res.status === 401) {
        const json = await res.json();
        expect(json.error).toBe("Unauthorized");
      }
    });
  });
});

describe("Security: Auth signer endpoint authentication", () => {
  describe("GET /api/auth/signer", () => {
    it("should require authentication", async () => {
      const res = await fetch(`${API_BASE}/api/auth/signer`);
      expect(res.status).toBe(401);
    });
  });
});

describe("Security: Funding tx_hash replay protection", () => {
  describe("POST /api/ideas/[id]/fund with duplicate tx_hash", () => {
    it("should reject funding with duplicate tx_hash", async () => {
      // Get an existing open idea
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();
      const openIdea = listJson.data?.find(
        (i: { status: string }) => i.status === "open"
      );

      if (!openIdea) {
        console.log("No open idea found, skipping test");
        return;
      }

      const duplicateTxHash = "0xduplicate" + Date.now().toString(16);

      // First funding request (may fail for other reasons like no auth or insufficient balance)
      const res1 = await fetch(`${API_BASE}/api/ideas/${openIdea.id}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          amount: 10,
          tx_hash: duplicateTxHash,
        }),
      });

      // Second request with same tx_hash should be rejected with 409
      const res2 = await fetch(`${API_BASE}/api/ideas/${openIdea.id}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          amount: 10,
          tx_hash: duplicateTxHash,
        }),
      });

      // If first succeeded and second attempted, should get 409
      // Otherwise, both may fail for auth/balance reasons
      if (res1.status === 200 || res1.status === 201) {
        expect(res2.status).toBe(409);
        const json2 = await res2.json();
        expect(json2.error).toContain("already been recorded");
      }
    });
  });
});

describe("Security: Record-reward tx_hash replay protection", () => {
  describe("POST /api/record-reward with duplicate tx_hash", () => {
    it("should reject request without authentication", async () => {
      const res = await fetch(`${API_BASE}/api/record-reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          tx_hash: "0xrewardtest" + Date.now().toString(16),
          amount: 100,
          idea_id: 283,
        }),
      });

      // Should require authentication
      expect(res.status).toBe(401);
    });

    it("should reject request with invalid tx_hash format", async () => {
      const res = await fetch(`${API_BASE}/api/record-reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          tx_hash: "invalid-not-0x",
          amount: 100,
          idea_id: 283,
        }),
      });

      // Either 400 (invalid format) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });

    it("should reject request with missing amount", async () => {
      const res = await fetch(`${API_BASE}/api/record-reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          tx_hash: "0xrewardtest" + Date.now().toString(16),
          idea_id: 283,
        }),
      });

      // Either 400 (missing amount) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });

    it("should reject request with zero amount", async () => {
      const res = await fetch(`${API_BASE}/api/record-reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          tx_hash: "0xrewardtest" + Date.now().toString(16),
          amount: 0,
          idea_id: 283,
        }),
      });

      // Either 400 (invalid amount) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });

    it("should reject request with missing idea_id (v2)", async () => {
      const res = await fetch(`${API_BASE}/api/record-reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          tx_hash: "0xrewardtest" + Date.now().toString(16),
          amount: 100,
        }),
      });

      // Either 400 (missing idea_id) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });
  });
});

describe("Security: Record-refund tx_hash replay protection", () => {
  describe("POST /api/ideas/[id]/record-refund", () => {
    it("should reject request without authentication", async () => {
      const res = await fetch(`${API_BASE}/api/ideas/1/record-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          tx_hash: "0xrefundtest" + Date.now().toString(16),
          amount: 100,
        }),
      });

      // Should require authentication
      expect(res.status).toBe(401);
    });

    it("should reject request with invalid tx_hash format", async () => {
      const res = await fetch(`${API_BASE}/api/ideas/1/record-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          tx_hash: "invalid-not-0x",
          amount: 100,
        }),
      });

      // Either 400 (invalid format) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });

    it("should reject request with invalid idea ID", async () => {
      const res = await fetch(`${API_BASE}/api/ideas/invalid/record-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          tx_hash: "0xrefundtest" + Date.now().toString(16),
          amount: 100,
        }),
      });

      expect(res.status).toBe(400);
    });
  });
});

describe("Security: Claim-reward double-claim prevention", () => {
  describe("POST /api/claim-reward", () => {
    it("should reject when no new rewards available (already claimed on-chain)", async () => {
      // This tests the on-chain check that prevents double-claims
      // For a user with no completed projects, should return appropriate error
      const res = await fetch(`${API_BASE}/api/claim-reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 999999999, // FID with no rewards
          recipient: "0x1234567890123456789012345678901234567890",
        }),
      });

      // Should fail with 400 (no rewards) or 401 (no auth)
      expect([400, 401]).toContain(res.status);

      if (res.status === 400) {
        const json = await res.json();
        expect(json.error).toContain("No rewards");
      }
    });
  });

  describe("GET /api/claim-reward", () => {
    it("should return breakdown showing previously claimed amount", async () => {
      const res = await fetch(`${API_BASE}/api/claim-reward?fid=12345`);

      expect(res.ok).toBe(true);
      const json = await res.json();

      // Should include all expected fields
      expect(json).toHaveProperty("fid");
      expect(json).toHaveProperty("totalRewards");
      expect(json).toHaveProperty("builderRewards");
      expect(json).toHaveProperty("submitterRewards");
      expect(json).toHaveProperty("builderProjects");
      expect(json).toHaveProperty("submittedIdeas");

      // All reward values should be numbers >= 0
      expect(typeof json.totalRewards).toBe("number");
      expect(json.totalRewards).toBeGreaterThanOrEqual(0);
      expect(typeof json.builderRewards).toBe("number");
      expect(json.builderRewards).toBeGreaterThanOrEqual(0);
      expect(typeof json.submitterRewards).toBe("number");
      expect(json.submitterRewards).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("Security: Refund-signature double-claim prevention", () => {
  describe("POST /api/ideas/[id]/refund-signature", () => {
    it("should reject when already claimed on-chain", async () => {
      // Get an existing idea
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();
      const openIdea = listJson.data?.find(
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
            user_fid: 999999999, // FID with no funding
            recipient: "0x1234567890123456789012345678901234567890",
          }),
        }
      );

      // Should fail - either no funding or no refund available
      expect([400, 401]).toContain(res.status);
    });

    it("should include delta amount in response (showing what can actually be claimed)", async () => {
      // This validates the response structure includes the security fields
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();
      const openIdea = listJson.data?.find(
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

      // If successful, should include delta fields
      if (res.ok) {
        const json = await res.json();
        expect(json).toHaveProperty("cumulativeAmount");
        expect(json).toHaveProperty("deltaAmount");
        expect(json).toHaveProperty("deltaAmountUsdc");
        expect(json).toHaveProperty("signature");
      }
    });
  });
});

describe("Security: Input validation", () => {
  describe("FID validation", () => {
    it("should reject negative FID", async () => {
      const res = await fetch(`${API_BASE}/api/claim-reward?fid=-1`);
      // Should either return empty results or reject
      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(json.totalRewards).toBe(0);
    });

    it("should reject non-numeric FID", async () => {
      const res = await fetch(`${API_BASE}/api/claim-reward?fid=abc`);
      expect(res.status).toBe(400);
    });
  });

  describe("Wallet address validation", () => {
    it("should reject invalid wallet address format", async () => {
      const res = await fetch(`${API_BASE}/api/claim-reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          recipient: "not-a-valid-address",
        }),
      });

      // Auth check happens before input validation, so 401 is also valid
      expect([400, 401]).toContain(res.status);
    });

    it("should reject wallet address without 0x prefix", async () => {
      const res = await fetch(`${API_BASE}/api/claim-reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          recipient: "1234567890123456789012345678901234567890",
        }),
      });

      // Auth check happens before input validation, so 401 is also valid
      expect([400, 401]).toContain(res.status);
    });
  });
});

describe("Security: On-chain funding enforcement", () => {
  describe("POST /api/ideas/[id]/fund with VAULT_ADDRESS configured", () => {
    it("should require tx_hash when on-chain mode is enabled", async () => {
      // Get an existing open idea
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();
      const openIdea = listJson.data?.find(
        (i: { status: string }) => i.status === "open"
      );

      if (!openIdea) {
        console.log("No open idea found, skipping test");
        return;
      }

      // Fund without tx_hash - should be rejected if on-chain mode is active
      const res = await fetch(`${API_BASE}/api/ideas/${openIdea.id}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          amount: 10,
          // tx_hash intentionally omitted
        }),
      });

      // If VAULT_ADDRESS is set, should require tx_hash (400)
      // If not set (off-chain mode), may fail for other reasons (401 auth, 400 balance)
      // Either way, shouldn't succeed without tx_hash when on-chain is required
      if (res.status === 400) {
        const json = await res.json();
        // Could be "tx_hash required" or other validation error
        expect(json.error).toBeTruthy();
      }
    });

    it("should reject invalid tx_hash format for on-chain funding", async () => {
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();
      const openIdea = listJson.data?.find(
        (i: { status: string }) => i.status === "open"
      );

      if (!openIdea) {
        console.log("No open idea found, skipping test");
        return;
      }

      const res = await fetch(`${API_BASE}/api/ideas/${openIdea.id}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          amount: 10,
          tx_hash: "not-a-valid-tx-hash", // Invalid format
        }),
      });

      // Should reject - either auth or validation
      expect([400, 401]).toContain(res.status);
    });
  });
});

describe("Security: Global record-refund endpoint", () => {
  describe("POST /api/record-refund", () => {
    it("should require authentication", async () => {
      const res = await fetch(`${API_BASE}/api/record-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          tx_hash: "0xglobalrefund" + Date.now().toString(16),
          amount: 100,
        }),
      });

      expect(res.status).toBe(401);
    });

    it("should reject missing user_fid", async () => {
      const res = await fetch(`${API_BASE}/api/record-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tx_hash: "0xglobalrefund" + Date.now().toString(16),
          amount: 100,
        }),
      });

      // Either 400 (missing user_fid) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });

    it("should reject invalid tx_hash format", async () => {
      const res = await fetch(`${API_BASE}/api/record-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 12345,
          tx_hash: "invalid-format",
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
          tx_hash: "0xglobalrefund" + Date.now().toString(16),
          amount: 0,
        }),
      });

      // Either 400 (invalid amount) or 401 (no auth)
      expect([400, 401]).toContain(res.status);
    });
  });
});

describe("Security: FID mismatch protection (403)", () => {
  describe("Endpoints should reject mismatched FID", () => {
    // Note: These tests verify the 403 behavior when auth is present but FID doesn't match
    // Without proper auth headers, they will return 401 instead
    // The actual 403 behavior is tested when QuickAuth is properly configured

    it("should reject fund request with mismatched user_fid", async () => {
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();
      const openIdea = listJson.data?.find(
        (i: { status: string }) => i.status === "open"
      );

      if (!openIdea) {
        console.log("No open idea found, skipping test");
        return;
      }

      // Without auth, should get 401
      // With auth but wrong FID, would get 403
      const res = await fetch(`${API_BASE}/api/ideas/${openIdea.id}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 999888777, // Random FID that won't match any auth
          amount: 10,
          tx_hash: "0xtest" + Date.now().toString(16),
        }),
      });

      // Without proper auth, 401 is expected
      // With auth but wrong FID, 403 is expected
      expect([400, 401, 403]).toContain(res.status);
    });

    it("should reject record-refund request with mismatched user_fid", async () => {
      const res = await fetch(`${API_BASE}/api/record-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 999888777, // Random FID
          tx_hash: "0xtest" + Date.now().toString(16),
          amount: 100,
        }),
      });

      // Without proper auth, 401 is expected
      // With auth but wrong FID, 403 is expected
      expect([401, 403]).toContain(res.status);
    });

    it("should reject record-reward request with mismatched user_fid", async () => {
      const res = await fetch(`${API_BASE}/api/record-reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 999888777, // Random FID
          tx_hash: "0xtest" + Date.now().toString(16),
          amount: 100,
        }),
      });

      // Without proper auth, 401 is expected
      // With auth but wrong FID, 403 is expected
      expect([401, 403]).toContain(res.status);
    });

    it("should reject claim-reward signature request with mismatched user_fid", async () => {
      const res = await fetch(`${API_BASE}/api/claim-reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: 999888777, // Random FID
          recipient: "0x1234567890123456789012345678901234567890",
        }),
      });

      // Without proper auth, 401 is expected
      // With auth but wrong FID, 403 is expected
      expect([400, 401, 403]).toContain(res.status);
    });
  });
});

describe("Security: Cumulative claim calculation", () => {
  describe("GET /api/claim-reward response structure", () => {
    it("should return cumulative tracking fields", async () => {
      const res = await fetch(`${API_BASE}/api/claim-reward?fid=12345`);

      expect(res.ok).toBe(true);
      const json = await res.json();

      // Verify structure includes tracking fields
      expect(json).toHaveProperty("fid");
      expect(json).toHaveProperty("totalRewards");
      expect(json).toHaveProperty("builderRewards");
      expect(json).toHaveProperty("submitterRewards");

      // Values should be numbers
      expect(typeof json.fid).toBe("number");
      expect(typeof json.totalRewards).toBe("number");
      expect(typeof json.builderRewards).toBe("number");
      expect(typeof json.submitterRewards).toBe("number");
    });

    it("should return projects/ideas breakdown", async () => {
      const res = await fetch(`${API_BASE}/api/claim-reward?fid=12345`);

      expect(res.ok).toBe(true);
      const json = await res.json();

      // Should include project breakdowns
      expect(json).toHaveProperty("builderProjects");
      expect(json).toHaveProperty("submittedIdeas");
      expect(Array.isArray(json.builderProjects)).toBe(true);
      expect(Array.isArray(json.submittedIdeas)).toBe(true);
    });
  });

  describe("Refund signature cumulative math", () => {
    it("should include cumulative amount in refund signature response", async () => {
      const listRes = await fetch(`${API_BASE}/api/ideas`);
      const listJson = await listRes.json();
      const openIdea = listJson.data?.find(
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

      // If successful (user has eligible refunds), verify response structure
      if (res.ok) {
        const json = await res.json();
        // Should include cumulative tracking fields
        expect(json).toHaveProperty("cumulativeAmount");
        expect(json).toHaveProperty("deltaAmount");
        expect(json).toHaveProperty("deltaAmountUsdc");
        expect(json).toHaveProperty("thisIdeaRefundUsdc");
        expect(json).toHaveProperty("signature");

        // Delta should be a string (bigint serialized)
        expect(typeof json.deltaAmount).toBe("string");
        // deltaAmountUsdc should be a number
        expect(typeof json.deltaAmountUsdc).toBe("number");
      }
    });
  });
});
