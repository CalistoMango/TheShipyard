/**
 * Simple in-memory rate limiter
 * For production, use Redis-based rate limiting (e.g., @upstash/ratelimit)
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store (resets on server restart)
const rateLimitStore = new Map<string, RateLimitEntry>();

interface RateLimitConfig {
  /** Maximum requests allowed */
  limit: number;
  /** Window duration in milliseconds */
  window: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

/**
 * Check rate limit for a given identifier
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const key = identifier;

  let entry = rateLimitStore.get(key);

  // Reset if window has passed
  if (!entry || now >= entry.resetAt) {
    entry = {
      count: 0,
      resetAt: now + config.window,
    };
  }

  // Check limit
  if (entry.count >= config.limit) {
    return {
      success: false,
      remaining: 0,
      reset: entry.resetAt,
    };
  }

  // Increment count
  entry.count++;
  rateLimitStore.set(key, entry);

  return {
    success: true,
    remaining: config.limit - entry.count,
    reset: entry.resetAt,
  };
}

/**
 * Pre-configured rate limiters
 */
export const rateLimiters = {
  // General API: 100 requests per minute
  api: (identifier: string) =>
    checkRateLimit(`api:${identifier}`, { limit: 100, window: 60 * 1000 }),

  // Funding: 10 requests per minute
  funding: (identifier: string) =>
    checkRateLimit(`funding:${identifier}`, { limit: 10, window: 60 * 1000 }),

  // Voting: 20 votes per minute
  voting: (identifier: string) =>
    checkRateLimit(`voting:${identifier}`, { limit: 20, window: 60 * 1000 }),

  // Build submission: 5 per hour
  builds: (identifier: string) =>
    checkRateLimit(`builds:${identifier}`, { limit: 5, window: 60 * 60 * 1000 }),

  // Ingest: 50 per minute (for webhooks)
  ingest: (identifier: string) =>
    checkRateLimit(`ingest:${identifier}`, { limit: 50, window: 60 * 1000 }),
};

/**
 * Rate limit middleware helper
 * Returns headers and error response if rate limited
 */
export function createRateLimitResponse(result: RateLimitResult): {
  headers: Record<string, string>;
  errorResponse?: { error: string; retry_after: number };
} {
  const headers = {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.reset),
  };

  if (!result.success) {
    return {
      headers,
      errorResponse: {
        error: "Rate limit exceeded",
        retry_after: Math.ceil((result.reset - Date.now()) / 1000),
      },
    };
  }

  return { headers };
}

// Cleanup old entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);
