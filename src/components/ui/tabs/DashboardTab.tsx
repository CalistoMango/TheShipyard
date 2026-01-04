"use client";

import { useEffect, useState } from "react";
import { useMiniApp } from "@neynar/react";
import { useAccount, useWriteContract, useSwitchChain } from "wagmi";
import { VAULT_ADDRESS, vaultAbi, CHAIN_ID } from "~/lib/contracts";
import { BUILDER_FEE_PERCENT, SUBMITTER_FEE_PERCENT } from "~/lib/constants";
import type { Idea } from "~/lib/types";
import { authFetch, authPost } from "~/lib/api";

interface DashboardTabProps {
  onSelectIdea: (idea: Idea) => void;
  onOpenAdmin?: () => void;
}

interface UserStats {
  ideas_submitted: number;
  total_funded: number;
  total_earnings: number;
  approved_builds: number;
  total_builds: number;
  current_streak: number;
}

interface RecentIdea {
  id: number;
  title: string;
  category: string;
  status: string;
  pool: number;
  upvotes?: number;
}

interface RecentBuild {
  id: string;
  idea_id: number;
  idea_title: string;
  idea_pool: number;
  status: string;
  created_at: string;
}

interface RecentFunding {
  idea_id: number;
  idea_title: string;
  idea_status: string;
  amount: number;
  created_at: string;
  refund_eligible: boolean;
  days_until_refund: number;
}

interface PendingVote {
  id: string;
  idea_id: number;
  idea_title: string;
  idea_pool: number;
}

interface RewardProject {
  idea_id: number;
  title: string;
  reward: number;
  claimable: number;
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
  recent_ideas: RecentIdea[];
  recent_builds: RecentBuild[];
  recent_funding: RecentFunding[];
  pending_votes?: PendingVote[];
}

type DashboardSubTab = "ideas" | "funded" | "building" | "votes";

interface UserProfile {
  fid: number;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
  balance: number;
  streak: number;
  created_at: string;
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

export function DashboardTab({ onSelectIdea, onOpenAdmin }: DashboardTabProps) {
  const { context } = useMiniApp();
  const { address, chainId: walletChainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [rewardsData, setRewardsData] = useState<RewardsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<DashboardSubTab>("funded");
  const [withdrawingIdeaId, setWithdrawingIdeaId] = useState<number | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [refundSuccess, setRefundSuccess] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [buildsExpanded, setBuildsExpanded] = useState(false);

  const { writeContractAsync } = useWriteContract();

  const handleIdeaClick = async (ideaId: number) => {
    try {
      const res = await fetch(`/api/ideas/${ideaId}`);
      const data = await res.json();
      if (data.data?.idea) {
        onSelectIdea(data.data.idea);
      }
    } catch (error) {
      console.error("Failed to fetch idea:", error);
    }
  };

  const userFid = context?.user?.fid;

  useEffect(() => {
    async function fetchUserData() {
      if (!userFid) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Fetch user data, rewards, and admin status in parallel
        const [userRes, rewardsRes, adminRes] = await Promise.all([
          authFetch(`/api/users/${userFid}`),
          fetch(`/api/claim-reward?fid=${userFid}`),
          fetch(`/api/admin/check?fid=${userFid}`),
        ]);

        if (userRes.ok) {
          const data = await userRes.json();
          setUserData(data.data);
        } else if (userRes.status === 404) {
          setUserData(null);
        }

        if (rewardsRes.ok) {
          const rewardsJson = await rewardsRes.json();
          setRewardsData(rewardsJson);
        }

        if (adminRes.ok) {
          const adminData = await adminRes.json();
          setIsAdmin(adminData.is_admin);
        }
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchUserData();
  }, [userFid]);

  // Handle refund claim
  const handleWithdraw = async (ideaId: number) => {
    if (!userFid || !address || !VAULT_ADDRESS) {
      setWithdrawError("Please connect your wallet first");
      return;
    }

    setWithdrawingIdeaId(ideaId);
    setWithdrawError(null);

    try {
      // Switch network if needed
      if (walletChainId !== CHAIN_ID) {
        await switchChain({ chainId: CHAIN_ID });
      }

      // Get signature from backend (authenticated)
      const res = await authPost(`/api/ideas/${ideaId}/refund-signature`, {
        user_fid: userFid,
        recipient: address,
      });

      const signatureData = await res.json();

      if (!res.ok) {
        throw new Error(signatureData.error || "Failed to get refund signature");
      }

      const { projectId, cumAmt, amountUsdc, deadline, signature } = signatureData;

      // Submit to contract (v3: cumulative amount)
      const txHash = await writeContractAsync({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "claimRefund",
        args: [
          projectId as `0x${string}`,
          BigInt(userFid),
          address,
          BigInt(cumAmt),
          BigInt(deadline),
          signature as `0x${string}`,
        ],
        chainId: CHAIN_ID,
      });

      // CRITICAL: Record the refund in the database to prevent double-claims (authenticated)
      // This marks funding records as refunded and updates the pool
      const recordRes = await authPost(`/api/ideas/${ideaId}/record-refund`, {
        user_fid: userFid,
        tx_hash: txHash,
        amount: amountUsdc,
      });

      if (!recordRes.ok) {
        console.error("Failed to record refund in database:", await recordRes.json());
        // Don't throw - the on-chain tx succeeded, we just failed to record
      }

      // Mark success
      setRefundSuccess(true);

      // Refetch user data after recording (with auth for private stats)
      const userRes = await authFetch(`/api/users/${userFid}`);
      if (userRes.ok) {
        const data = await userRes.json();
        setUserData(data.data);
      }
    } catch (error) {
      console.error("Withdraw error:", error);
      setWithdrawError(error instanceof Error ? error.message : "Failed to withdraw");
      setRefundSuccess(false);
    } finally {
      setWithdrawingIdeaId(null);
    }
  };

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

      // Find the first project to claim from (v2: per-project claims)
      // Priority: builder projects first, then submitter projects
      const firstBuilderProject = rewardsData?.builderProjects?.[0];
      const firstSubmitterProject = rewardsData?.submittedIdeas?.[0];
      const projectToClaim = firstBuilderProject || firstSubmitterProject;

      if (!projectToClaim) {
        throw new Error("No projects with unclaimed rewards");
      }

      // Get signature from backend for this specific project (authenticated)
      const res = await authPost("/api/claim-reward", {
        user_fid: userFid,
        recipient: address,
        idea_id: projectToClaim.idea_id,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to get reward signature");
      }

      const { projectId, cumAmt, amountUsdc, deadline, signature, ideaId } = await res.json();

      // Submit to contract (v3: cumulative amount)
      const claimTxHash = await writeContractAsync({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "claimReward",
        args: [
          projectId as `0x${string}`,
          BigInt(userFid),
          address,
          BigInt(cumAmt),
          BigInt(deadline),
          signature as `0x${string}`,
        ],
        chainId: CHAIN_ID,
      });

      // CRITICAL: Record the reward claim in the database to prevent double-claims (authenticated)
      const recordRes = await authPost("/api/record-reward", {
        user_fid: userFid,
        tx_hash: claimTxHash,
        amount: amountUsdc,
        idea_id: ideaId,
      });

      if (!recordRes.ok) {
        console.error("Failed to record reward in database:", await recordRes.json());
      }

      // Mark success
      setClaimSuccess(true);

      // Refetch rewards after claim
      const rewardsRes = await fetch(`/api/claim-reward?fid=${userFid}`);
      if (rewardsRes.ok) {
        const rewardsJson = await rewardsRes.json();
        setRewardsData(rewardsJson);
      }
    } catch (error) {
      console.error("Claim reward error:", error);
      setClaimError(error instanceof Error ? error.message : "Failed to claim rewards");
      setClaimSuccess(false);
    } finally {
      setIsClaiming(false);
    }
  };

  // Not logged in via Farcaster
  if (!context?.user) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">My Dashboard</h2>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 text-center">
          <p className="text-gray-400 mb-4">Open this app in Farcaster to view your activity.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">My Dashboard</h2>
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  // Use context data for display, API data for stats
  const displayName = context.user.displayName || context.user.username || `fid:${context.user.fid}`;
  const pfpUrl = context.user.pfpUrl;

  const stats = {
    ideas_submitted: userData?.stats?.ideas_submitted ?? 0,
    total_funded: userData?.stats?.total_funded ?? 0,
    total_earnings: userData?.stats?.total_earnings ?? 0,
    approved_builds: userData?.stats?.approved_builds ?? 0,
    total_builds: userData?.stats?.total_builds ?? 0,
    current_streak: userData?.stats?.current_streak ?? 0,
  };

  const recentIdeas = userData?.recent_ideas || [];
  const recentBuilds = userData?.recent_builds || [];
  const recentFunding = userData?.recent_funding || [];
  const joinDate = userData?.user?.created_at;

  // Calculate success rate (approved builds / total builds)
  const successRate = stats.total_builds > 0
    ? Math.round((stats.approved_builds / stats.total_builds) * 100)
    : 0;

  // Pending votes from API (builds user can vote on, excludes already voted)
  const pendingVotes = userData?.pending_votes || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">My Dashboard</h2>
        {isAdmin && onOpenAdmin && (
          <button
            onClick={onOpenAdmin}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg font-medium"
          >
            Admin
          </button>
        )}
      </div>

      {/* Profile Header */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-3">
          {pfpUrl ? (
            <img src={pfpUrl} alt="" className="w-10 h-10 rounded-full" />
          ) : (
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full" />
          )}
          <div className="flex-1">
            <h3 className="text-base font-bold text-white">{displayName}</h3>
            <p className="text-gray-400 text-sm">
              {joinDate ? `Joined ${formatTimeAgo(joinDate)}` : ""}
            </p>
          </div>
          {/* Highest badge */}
          {stats.approved_builds >= 5 ? (
            <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-sm">
              💎 Pro Builder
            </span>
          ) : stats.current_streak >= 3 ? (
            <span className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm">
              ⚡ Building Streak
            </span>
          ) : stats.approved_builds >= 1 ? (
            <span className="px-3 py-1 bg-yellow-500/20 text-yellow-300 rounded-full text-sm">
              🏆 First Build
            </span>
          ) : null}
        </div>

        {/* Submitter Stats Row */}
        <div className="grid grid-cols-4 gap-3 py-3 border-t border-gray-700">
          <div className="text-center">
            <div className="text-lg font-bold text-white">{stats.ideas_submitted}</div>
            <div className="text-xs text-gray-500">Ideas submitted</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-emerald-400">${stats.total_funded}</div>
            <div className="text-xs text-gray-500">Total funding</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-blue-400">{recentIdeas.filter(i => i.status === 'completed').length}</div>
            <div className="text-xs text-gray-500">My ideas built</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-purple-400">{recentIdeas.reduce((sum, i) => sum + (i.upvotes || 0), 0)}</div>
            <div className="text-xs text-gray-500">My upvotes</div>
          </div>
        </div>

        {/* Builder Stats Row */}
        <div className="grid grid-cols-4 gap-3 py-3 border-t border-gray-700">
          <div className="text-center">
            <div className="text-lg font-bold text-white">{stats.approved_builds}</div>
            <div className="text-xs text-gray-500">Builds</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-emerald-400">
              ${stats.total_earnings.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500">Earn from build</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-white">
              {stats.approved_builds > 0 ? `${successRate}%` : "-"}
            </div>
            <div className="text-xs text-gray-500">Build success</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-orange-400">
              {stats.current_streak > 0 ? `${stats.current_streak}🔥` : "0"}
            </div>
            <div className="text-xs text-gray-500">Built streak</div>
          </div>
        </div>
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
                    <span className="text-emerald-400 flex-shrink-0">${p.claimable.toFixed(2)}</span>
                  </div>
                ))}
                {rewardsData.submittedIdeas.map((p) => (
                  <div key={`submitter-${p.idea_id}`} className="flex justify-between text-gray-400">
                    <span className="truncate mr-2">{p.title} (idea)</span>
                    <span className="text-blue-400 flex-shrink-0">${p.claimable.toFixed(2)}</span>
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
          {claimSuccess && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 mb-3 text-green-400 text-sm">
              Rewards claimed successfully!
            </div>
          )}

          <button
            onClick={handleClaimRewards}
            disabled={isClaiming || !address}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 text-white py-3 rounded-lg font-medium"
          >
            {!address
              ? "Connect Wallet to Claim"
              : isClaiming
                ? "Processing..."
                : `Claim $${(rewardsData.builderProjects[0]?.claimable ?? rewardsData.submittedIdeas[0]?.claimable ?? 0).toFixed(2)} USDC`}
          </button>
        </div>
      )}

      {/* Recent Builds - collapsible unless there's a claim available */}
      {recentBuilds.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <button
            onClick={() => !rewardsData?.totalRewards && setBuildsExpanded(!buildsExpanded)}
            className="w-full flex items-center justify-between"
          >
            <h3 className="font-semibold text-white">Recent Builds</h3>
            {!rewardsData?.totalRewards && (
              <span className="text-gray-400 text-sm">{buildsExpanded ? "▲" : "▼"}</span>
            )}
          </button>
          {(buildsExpanded || (rewardsData?.totalRewards ?? 0) > 0) && (
            <div className="space-y-3 mt-3">
              {recentBuilds.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0 cursor-pointer hover:bg-gray-700/30 -mx-2 px-2 rounded transition-colors"
                  onClick={() => handleIdeaClick(b.idea_id)}
                >
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
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-700">
        <button
          onClick={() => setActiveSubTab("ideas")}
          className={`pb-2 ${activeSubTab === "ideas" ? "border-b-2 border-white text-white font-medium" : "text-gray-400"}`}
        >
          My Ideas
        </button>
        <button
          onClick={() => setActiveSubTab("funded")}
          className={`pb-2 ${activeSubTab === "funded" ? "border-b-2 border-white text-white font-medium" : "text-gray-400"}`}
        >
          Funded
        </button>
        <button
          onClick={() => setActiveSubTab("building")}
          className={`pb-2 ${activeSubTab === "building" ? "border-b-2 border-white text-white font-medium" : "text-gray-400"}`}
        >
          Building
        </button>
        <button
          onClick={() => setActiveSubTab("votes")}
          className={`pb-2 ${activeSubTab === "votes" ? "border-b-2 border-white text-white font-medium" : "text-gray-400"}`}
        >
          Votes{pendingVotes.length > 0 && ` (${pendingVotes.length})`}
        </button>
      </div>

      {/* Tab Content */}
      {activeSubTab === "ideas" && (
        <div className="space-y-3">
          {recentIdeas.length === 0 ? (
            <p className="text-gray-500 text-sm py-4">You haven&apos;t submitted any ideas yet.</p>
          ) : (
            recentIdeas.map((idea) => (
              <div
                key={idea.id}
                onClick={() => handleIdeaClick(idea.id)}
                className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 hover:border-gray-600 cursor-pointer transition-all"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-white truncate">{idea.title}</h4>
                    <p className="text-gray-500 text-sm">{idea.status}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-emerald-400 font-bold">${idea.pool}</div>
                    <div className="text-gray-500 text-xs">pool</div>
                  </div>
                </div>
                {idea.pool > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-700 flex items-center justify-between">
                    <span className="text-gray-400 text-sm">Potential earnings:</span>
                    <span className="text-emerald-400 font-medium">${(idea.pool * SUBMITTER_FEE_PERCENT / 100).toFixed(2)} ({SUBMITTER_FEE_PERCENT}%)</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeSubTab === "funded" && (
        <div className="space-y-3">
          {withdrawError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
              {withdrawError}
            </div>
          )}
          {refundSuccess && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm">
              Refund claimed successfully!
            </div>
          )}
          {recentFunding.length === 0 ? (
            <p className="text-gray-500 text-sm py-4">You haven&apos;t funded any ideas yet.</p>
          ) : (
            recentFunding.map((f, i) => (
              <div
                key={i}
                className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 transition-all"
              >
                <div
                  onClick={() => f.idea_id && handleIdeaClick(f.idea_id)}
                  className="flex items-center justify-between gap-4 cursor-pointer hover:opacity-80"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-white truncate">{f.idea_title}</h4>
                    <p className="text-gray-500 text-sm">{formatTimeAgo(f.created_at)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-emerald-400 font-bold">${f.amount}</div>
                    {f.idea_status === "completed" && (
                      <span className="text-green-400 text-xs">Completed</span>
                    )}
                    {f.idea_status === "already_exists" && (
                      <span className="text-red-400 text-xs">Already Exists</span>
                    )}
                  </div>
                </div>

                {/* Warning for already_exists ideas */}
                {f.idea_status === "already_exists" && (
                  <div className="mt-2 bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-red-400 text-xs">
                    This idea already exists. Please reclaim your funds.
                  </div>
                )}

                {/* Refund section for open or already_exists ideas */}
                {(f.idea_status === "open" || f.idea_status === "already_exists") && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (f.refund_eligible) {
                          handleWithdraw(f.idea_id);
                        }
                      }}
                      disabled={!f.refund_eligible || withdrawingIdeaId === f.idea_id}
                      className={`w-full py-2 rounded-lg text-sm font-medium ${
                        f.refund_eligible
                          ? "bg-orange-600 hover:bg-orange-500 text-white"
                          : "bg-gray-700 text-gray-400 cursor-not-allowed"
                      } disabled:opacity-50`}
                    >
                      {withdrawingIdeaId === f.idea_id
                        ? "Processing..."
                        : f.refund_eligible
                          ? "Claim Refund"
                          : `Refund in ${f.days_until_refund} day${f.days_until_refund !== 1 ? "s" : ""}`}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeSubTab === "building" && (
        <div className="space-y-3">
          {recentBuilds.length === 0 ? (
            <p className="text-gray-500 text-sm py-4">You haven&apos;t submitted any builds yet.</p>
          ) : (
            recentBuilds.map((b) => (
              <div
                key={b.id}
                onClick={() => handleIdeaClick(b.idea_id)}
                className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 hover:border-gray-600 cursor-pointer transition-all"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-white truncate">{b.idea_title}</h4>
                    <p className="text-gray-500 text-sm">{formatTimeAgo(b.created_at)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {b.status === "approved" ? (
                      <span className="text-green-400 text-sm">✓ Approved</span>
                    ) : b.status === "voting" ? (
                      <span className="text-yellow-400 text-sm">🗳️ Voting</span>
                    ) : b.status === "rejected" ? (
                      <span className="text-red-400 text-sm">✕ Rejected</span>
                    ) : (
                      <span className="text-gray-400 text-sm">{b.status}</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeSubTab === "votes" && (
        <div className="space-y-3">
          {pendingVotes.length === 0 ? (
            <p className="text-gray-500 text-sm py-4">No active votes to participate in.</p>
          ) : (
            <>
              {/* Info banner */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <span>🗳️</span>
                  <p className="text-amber-300 text-sm">
                    {pendingVotes.length} idea{pendingVotes.length > 1 ? "s" : ""} need{pendingVotes.length === 1 ? "s" : ""} your vote to help builders get rewarded!
                  </p>
                </div>
              </div>
              {pendingVotes.map((build) => (
              <button
                key={build.id}
                onClick={() => handleIdeaClick(build.idea_id)}
                className="w-full bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-left hover:border-amber-500/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">{build.idea_title}</h4>
                    <p className="text-gray-500 text-xs mt-1">Pool: ${build.idea_pool.toFixed(2)}</p>
                  </div>
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-xs rounded-full">
                    Vote Now →
                  </span>
                </div>
              </button>
              ))}
            </>
          )}
        </div>
      )}

    </div>
  );
}
