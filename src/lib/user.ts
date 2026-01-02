/**
 * User Utilities
 *
 * Centralized logic for user creation and management.
 */

import { createServerClient } from "./supabase";
import { fetchUserInfo } from "./neynar";

/**
 * User info returned from Neynar
 */
interface UserInfo {
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
}

/**
 * Ensure a user exists in the database with profile info.
 *
 * If the user doesn't exist, fetches their info from Neynar and creates them.
 * If the user exists but has no username, updates their profile from Neynar.
 *
 * @param fid - The Farcaster ID of the user
 * @returns The user's info if fetched, or null if user already existed with complete profile
 */
export async function ensureUserExists(fid: number): Promise<UserInfo | null> {
  const supabase = createServerClient();

  // Check if user exists
  const { data: existingUser } = await supabase
    .from("users")
    .select("fid, username")
    .eq("fid", fid)
    .single();

  if (!existingUser) {
    // Fetch user info from Neynar before creating
    const userInfo = await fetchUserInfo(fid);
    await supabase.from("users").insert({
      fid,
      username: userInfo?.username || null,
      display_name: userInfo?.display_name || null,
      pfp_url: userInfo?.pfp_url || null,
    });
    return userInfo;
  } else if (!existingUser.username) {
    // Update user if username is missing
    const userInfo = await fetchUserInfo(fid);
    if (userInfo?.username) {
      await supabase
        .from("users")
        .update({
          username: userInfo.username,
          display_name: userInfo.display_name,
          pfp_url: userInfo.pfp_url,
        })
        .eq("fid", fid);
    }
    return userInfo;
  }

  return null;
}

/**
 * Get display name for a user with fallback chain.
 *
 * @param user - User object with optional display_name and username
 * @param fid - Optional FID to use as fallback
 * @param fallback - Default fallback string (defaults to "Anonymous")
 * @returns The best available display name
 */
export function getDisplayName(
  user: { display_name?: string | null; username?: string | null } | null | undefined,
  fid?: number,
  fallback: string = "Anonymous"
): string {
  if (user?.display_name) return user.display_name;
  if (user?.username) return user.username;
  if (fid !== undefined) return `fid:${fid}`;
  return fallback;
}
