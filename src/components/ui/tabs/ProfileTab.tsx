"use client";

import { useEffect, useState } from "react";
import { useMiniApp } from "@neynar/react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from "wagmi";
import { VAULT_ADDRESS, vaultAbi, CHAIN_ID } from "~/lib/contracts";
import { BUILDER_FEE_PERCENT, SUBMITTER_FEE_PERCENT } from "~/lib/constants";
import { authPost } from "~/lib/api";

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

interface RewardProject {
  idea_id: number;
  title: string;
  reward: number;
}

interface RewardsData {
  totalRewards: number;
  builderRewards: number;
  submitterRewards: number;
  builderProjects: RewardProject[];
  submittedIdeas: RewardProject[];
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
  const { address, chainId: walletChainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [rewardsData, setRewardsData] = useState<RewardsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [_error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const { writeContractAsync, data: claimTxHash } = useWriteContract();
  const { isLoading: isClaimConfirming, isSuccess: isClaimConfirmed } = useWaitForTransactionReceipt({
    hash: claimTxHash,
    chainId: CHAIN_ID,
  });

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
        // Fetch user data, admin status, and rewards in parallel
        const [userRes, adminRes, rewardsRes] = await Promise.all([
          fetch(`/api/users/${userFid}`),
          fetch(`/api/admin/check?fid=${userFid}`),
          fetch(`/api/claim-reward?fid=${userFid}`),
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

        if (rewardsRes.ok) {
          const rewardsJson = await rewardsRes.json();
          setRewardsData(rewardsJson);
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

  // Handle claiming rewards
  const handleClaimRewards = async () => {
    if (!userFid || !address || !VAULT_ADDRESS) {
      setClaimError("Please connect your wallet first");
      return;
    }

    if (!rewardsData || rewardsData.totalRewards <= 0) {
      setClaimError("No rewards to claim");
      return;
    }

    setIsClaiming(true);
    setClaimError(null);

    try {
      // Switch network if needed
      if (walletChainId !== CHAIN_ID) {
        await switchChain({ chainId: CHAIN_ID });
      }

      // Get signature from backend (authenticated)
      const res = await authPost("/api/claim-reward", {
        user_fid: userFid,
        recipient: address,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to get reward signature");
      }

      const { cumulativeAmount, cumulativeAmountUsdc, deadline, signature } = await res.json();

      // Submit to contract
      const txHash = await writeContractAsync({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "claimReward",
        args: [
          BigInt(userFid),
          address,
          BigInt(cumulativeAmount),
          BigInt(deadline),
          signature as `0x${string}`,
        ],
        chainId: CHAIN_ID,
      });

      // CRITICAL: Record the reward claim in the database to prevent double-claims (authenticated)
      // This marks builder_reward_claimed and submitter_reward_claimed on ideas
      const recordRes = await authPost("/api/record-reward", {
        user_fid: userFid,
        tx_hash: txHash,
        amount: cumulativeAmountUsdc,
      });

      if (!recordRes.ok) {
        console.error("Failed to record reward in database:", await recordRes.json());
        // Don't throw - the on-chain tx succeeded
      }

      // Refetch rewards after claim (should now be 0)
      const rewardsRes = await fetch(`/api/claim-reward?fid=${userFid}`);
      if (rewardsRes.ok) {
        const rewardsJson = await rewardsRes.json();
        setRewardsData(rewardsJson);
      }
    } catch (error) {
      console.error("Claim reward error:", error);
      setClaimError(error instanceof Error ? error.message : "Failed to claim rewards");
    } finally {
      setIsClaiming(false);
    }
  };

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

      {/* Claim Rewards Section */}
      {rewardsData && rewardsData.totalRewards > 0 && (
        <div className="bg-gradient-to-r from-emerald-900/30 to-blue-900/30 border border-emerald-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-white">Available Rewards</h3>
            <div className="text-2xl font-bold text-emerald-400">
              ${rewardsData.totalRewards.toFixed(2)}
            </div>
          </div>

          {/* Breakdown */}
          <div className="space-y-2 mb-4 text-sm">
            {rewardsData.builderRewards > 0 && (
              <div className="flex items-center justify-between text-gray-300">
                <span>Builder rewards ({BUILDER_FEE_PERCENT}%)</span>
                <span className="text-emerald-400">${rewardsData.builderRewards.toFixed(2)}</span>
              </div>
            )}
            {rewardsData.submitterRewards > 0 && (
              <div className="flex items-center justify-between text-gray-300">
                <span>Idea submitter rewards ({SUBMITTER_FEE_PERCENT}%)</span>
                <span className="text-blue-400">${rewardsData.submitterRewards.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Project breakdown */}
          {(rewardsData.builderProjects.length > 0 || rewardsData.submittedIdeas.length > 0) && (
            <div className="border-t border-gray-700 pt-3 mb-4">
              <p className="text-xs text-gray-500 mb-2">From projects:</p>
              <div className="space-y-1 text-xs">
                {rewardsData.builderProjects.map((p) => (
                  <div key={`builder-${p.idea_id}`} className="flex justify-between text-gray-400">
                    <span className="truncate mr-2">{p.title}</span>
                    <span className="text-emerald-400 flex-shrink-0">${p.reward.toFixed(2)}</span>
                  </div>
                ))}
                {rewardsData.submittedIdeas.map((p) => (
                  <div key={`submitter-${p.idea_id}`} className="flex justify-between text-gray-400">
                    <span className="truncate mr-2">{p.title} (idea)</span>
                    <span className="text-blue-400 flex-shrink-0">${p.reward.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {claimError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 mb-3 text-red-400 text-sm">
              {claimError}
            </div>
          )}
          {isClaimConfirmed && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 mb-3 text-green-400 text-sm">
              Rewards claimed successfully!
            </div>
          )}

          <button
            onClick={handleClaimRewards}
            disabled={isClaiming || isClaimConfirming || !address}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 text-white py-3 rounded-lg font-medium"
          >
            {!address
              ? "Connect Wallet to Claim"
              : isClaiming || isClaimConfirming
                ? "Processing..."
                : `Claim $${rewardsData.totalRewards.toFixed(2)} USDC`}
          </button>
        </div>
      )}

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
                    <div className="text-emerald-400 font-medium">${(b.idea_pool * BUILDER_FEE_PERCENT / 100).toFixed(2)}</div>
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
