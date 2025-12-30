"use client";

import { useEffect, useState } from "react";
import { useMiniApp } from "@neynar/react";

interface ProfileTabProps {
  onOpenAdmin?: () => void;
}

interface UserProfile {
  fid: number;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
  balance: number;
  streak: number;
  created_at: string;
}

interface UserStats {
  ideas_submitted: number;
  total_funded: number;
  total_earnings: number;
  approved_builds: number;
  current_streak: number;
}

interface RecentBuild {
  id: string;
  idea_title: string;
  idea_pool: number;
  status: string;
  created_at: string;
}

interface UserData {
  user: UserProfile;
  stats: UserStats;
  recent_builds: RecentBuild[];
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) return "Today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 60) return "1 month ago";
  const months = Math.floor(diffDays / 30);
  return `${months} months ago`;
}

export function ProfileTab({ onOpenAdmin }: ProfileTabProps) {
  const { context } = useMiniApp();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [_error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const userFid = context?.user?.fid;

  useEffect(() => {
    async function fetchUserProfile() {
      if (!userFid) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Fetch user data and admin status in parallel
        const [userRes, adminRes] = await Promise.all([
          fetch(`/api/users/${userFid}`),
          fetch(`/api/admin/check?fid=${userFid}`),
        ]);

        if (userRes.ok) {
          const data = await userRes.json();
          setUserData(data.data);
        } else if (userRes.status === 404) {
          // User doesn't exist in our DB yet - that's okay, show empty state
          setUserData(null);
        } else {
          setError("Failed to load profile");
        }

        if (adminRes.ok) {
          const adminData = await adminRes.json();
          setIsAdmin(adminData.is_admin);
        }
      } catch (err) {
        console.error("Failed to fetch user profile:", err);
        setError("Failed to load profile");
      } finally {
        setLoading(false);
      }
    }

    fetchUserProfile();
  }, [userFid]);

  // Not logged in via Farcaster
  if (!context?.user) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">Builder Profile</h2>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 text-center">
          <p className="text-gray-400 mb-4">Open this app in Farcaster to view your profile.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">Builder Profile</h2>
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-400">Loading profile...</div>
        </div>
      </div>
    );
  }

  // Use context data for display, API data for stats
  const displayName = context.user.displayName || context.user.username || `fid:${context.user.fid}`;
  const username = context.user.username || `fid:${context.user.fid}`;
  const pfpUrl = context.user.pfpUrl;

  const stats = userData?.stats || {
    ideas_submitted: 0,
    total_funded: 0,
    total_earnings: 0,
    approved_builds: 0,
    current_streak: 0,
  };

  const recentBuilds = userData?.recent_builds || [];
  const joinDate = userData?.user?.created_at;

  // Calculate success rate
  const successRate = stats.approved_builds > 0
    ? Math.round((stats.approved_builds / (stats.approved_builds + 1)) * 100) // Placeholder calc
    : 0;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Builder Profile</h2>

      {/* Profile Header */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
        <div className="flex items-center gap-4 mb-4">
          {pfpUrl ? (
            <img src={pfpUrl} alt="" className="w-16 h-16 rounded-full" />
          ) : (
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full" />
          )}
          <div>
            <h3 className="text-xl font-bold text-white">{displayName}</h3>
            <p className="text-gray-400">
              {joinDate ? `Joined ${formatTimeAgo(joinDate)}` : `@${username}`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 py-4 border-t border-gray-700">
          <div className="text-center">
            <div className="text-2xl font-bold text-white">{stats.approved_builds}</div>
            <div className="text-xs text-gray-500">Bounties</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-400">
              ${stats.total_earnings.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500">Earned</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white">
              {stats.approved_builds > 0 ? `${successRate}%` : "-"}
            </div>
            <div className="text-xs text-gray-500">Success</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-400">
              {stats.current_streak > 0 ? `${stats.current_streak}🔥` : "0"}
            </div>
            <div className="text-xs text-gray-500">Streak</div>
          </div>
        </div>

        {/* Badges - only show if user has achievements */}
        {stats.approved_builds > 0 && (
          <div className="flex gap-2 mt-4 flex-wrap">
            {stats.approved_builds >= 1 && (
              <span className="px-3 py-1 bg-yellow-500/20 text-yellow-300 rounded-full text-sm">
                🏆 First Claim
              </span>
            )}
            {stats.current_streak >= 3 && (
              <span className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm">
                ⚡ On Fire
              </span>
            )}
            {stats.approved_builds >= 5 && (
              <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-sm">
                💎 Pro Builder
              </span>
            )}
          </div>
        )}
      </div>

      {/* Recent Builds */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
        <h3 className="font-semibold text-white mb-3">Recent Builds</h3>
        {recentBuilds.length === 0 ? (
          <p className="text-gray-500 text-sm">No builds yet. Submit your first build to claim a bounty!</p>
        ) : (
          <div className="space-y-3">
            {recentBuilds.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                <div>
                  <div className="text-white font-medium">{b.idea_title}</div>
                  <div className="text-gray-500 text-xs">{formatTimeAgo(b.created_at)}</div>
                </div>
                <div className="text-right">
                  {b.status === "approved" ? (
                    <div className="text-emerald-400 font-medium">${b.idea_pool * 0.7}</div>
                  ) : (
                    <span className="text-xs text-yellow-400">{b.status}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Admin Link - only visible to admins */}
      {isAdmin && onOpenAdmin && (
        <button
          onClick={onOpenAdmin}
          className="w-full bg-purple-600 hover:bg-purple-500 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2"
        >
          <span>Admin Dashboard</span>
        </button>
      )}
    </div>
  );
}
