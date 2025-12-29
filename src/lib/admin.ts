import { NextRequest } from "next/server";

/**
 * Verify admin authentication
 * Returns true if the request has valid admin credentials
 */
export function verifyAdminAuth(request: NextRequest): boolean {
  const adminKey = request.headers.get("x-admin-key");
  const expectedKey = process.env.ADMIN_API_KEY;

  if (!expectedKey) {
    console.warn("ADMIN_API_KEY not configured - admin endpoints disabled");
    return false;
  }

  return adminKey === expectedKey;
}

/**
 * List of admin FIDs (can also be configured via env)
 */
export function getAdminFids(): number[] {
  const envFids = process.env.ADMIN_FIDS;
  if (envFids) {
    return envFids.split(",").map((fid) => parseInt(fid.trim(), 10));
  }
  return [];
}

/**
 * Check if a FID is an admin
 */
export function isAdminFid(fid: number): boolean {
  return getAdminFids().includes(fid);
}
