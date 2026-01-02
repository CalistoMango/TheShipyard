import { NextRequest } from "next/server";
import { createClient, Errors } from "@farcaster/quick-auth";

const quickAuthClient = createClient();

interface AuthResult {
  authenticated: boolean;
  fid: number | null;
  error?: string;
}

/**
 * Validate a Farcaster QuickAuth token from request headers
 *
 * Usage in API routes:
 * ```
 * const auth = await validateAuth(request);
 * if (!auth.authenticated) {
 *   return NextResponse.json({ error: auth.error }, { status: 401 });
 * }
 * // auth.fid is the validated user FID
 * ```
 */
export async function validateAuth(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { authenticated: false, fid: null, error: "Missing authorization header" };
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  try {
    // SECURITY: Require NEXT_PUBLIC_URL in production to prevent Host header spoofing
    if (!process.env.NEXT_PUBLIC_URL && process.env.NODE_ENV === "production") {
      console.error("Auth validation failed: NEXT_PUBLIC_URL not configured in production");
      return { authenticated: false, fid: null, error: "Server configuration error" };
    }

    const domain = process.env.NEXT_PUBLIC_URL
      ? new URL(process.env.NEXT_PUBLIC_URL).hostname
      : "localhost"; // Only used in development

    const payload = await quickAuthClient.verifyJwt({ token, domain });

    return {
      authenticated: true,
      fid: typeof payload.sub === "string" ? parseInt(payload.sub, 10) : payload.sub
    };
  } catch (e) {
    if (e instanceof Errors.InvalidTokenError) {
      return { authenticated: false, fid: null, error: "Invalid token" };
    }
    console.error("Auth validation error:", e);
    return { authenticated: false, fid: null, error: "Authentication failed" };
  }
}

/**
 * Validate that the authenticated user matches the requested FID
 * Returns error message if mismatch, null if valid
 */
export function validateFidMatch(authFid: number, requestedFid: number): string | null {
  if (authFid !== requestedFid) {
    return `Unauthorized: authenticated as FID ${authFid}, cannot act as FID ${requestedFid}`;
  }
  return null;
}

/**
 * Check if a FID is an admin
 */
export function isAdminFid(fid: number): boolean {
  const adminFids = process.env.ADMIN_FIDS?.split(",").map((f) => parseInt(f.trim(), 10)) || [];
  return adminFids.includes(fid);
}
