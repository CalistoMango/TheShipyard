"use client";

import { useEffect, useState } from "react";
import { useMiniApp } from "@neynar/react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { VAULT_ADDRESS, vaultAbi } from "~/lib/contracts";
import type { Idea } from "~/lib/types";

interface DashboardTabProps {
  onSelectIdea: (idea: Idea) => void;
}

interface UserStats {
  ideas_submitted: number;
  total_funded: number;
  total_earnings: number;
  approved_builds: number;
}

interface RecentIdea {
  id: number;
  title: string;
  category: string;
  status: string;
  pool: number;
  upvotes: number;
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

interface UserData {
  stats: UserStats;
  recent_ideas: RecentIdea[];
  recent_builds: RecentBuild[];
  recent_funding: RecentFunding[];
}

type DashboardSubTab = "ideas" | "funded" | "building" | "votes";

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) return "Today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;
  const months = Math.floor(diffDays / 30);
  return `${months} months ago`;
}

export function DashboardTab({ onSelectIdea }: DashboardTabProps) {
  const { context } = useMiniApp();
  const { address } = useAccount();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<DashboardSubTab>("ideas");
  const [withdrawingIdeaId, setWithdrawingIdeaId] = useState<number | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const { writeContractAsync, data: withdrawTxHash } = useWriteContract();
  const { isLoading: isWithdrawConfirming, isSuccess: isWithdrawConfirmed } = useWaitForTransactionReceipt({
    hash: withdrawTxHash,
  });

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
        const res = await fetch(`/api/users/${userFid}`);
        if (res.ok) {
          const data = await res.json();
          setUserData(data.data);
        } else if (res.status === 404) {
          setUserData(null);
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
      // Get signature from backend
      const res = await fetch(`/api/ideas/${ideaId}/refund-signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_fid: userFid,
          recipient: address,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to get refund signature");
      }

      const { cumulativeAmount, deadline, signature } = await res.json();

      // Submit to contract
      await writeContractAsync({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "claimRefund",
        args: [
          BigInt(userFid),
          address,
          BigInt(cumulativeAmount),
          BigInt(deadline),
          signature as `0x${string}`,
        ],
      });

      // Refetch user data after confirmation
      const userRes = await fetch(`/api/users/${userFid}`);
      if (userRes.ok) {
        const data = await userRes.json();
        setUserData(data.data);
      }
    } catch (error) {
      console.error("Withdraw error:", error);
      setWithdrawError(error instanceof Error ? error.message : "Failed to withdraw");
    } finally {
      setWithdrawingIdeaId(null);
    }
  };

  // Not logged in via Farcaster
  if (!context?.user) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">My Activity</h2>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 text-center">
          <p className="text-gray-400 mb-4">Open this app in Farcaster to view your activity.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">My Activity</h2>
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  const stats = userData?.stats || {
    ideas_submitted: 0,
    total_funded: 0,
    total_earnings: 0,
    approved_builds: 0,
  };

  const recentIdeas = userData?.recent_ideas || [];
  const recentBuilds = userData?.recent_builds || [];
  const recentFunding = userData?.recent_funding || [];

  // Find builds that are in voting status
  const pendingVotes = recentBuilds.filter((b) => b.status === "voting");

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">My Activity</h2>

      {/* Stats Overview */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">{stats.ideas_submitted}</div>
          <div className="text-xs text-gray-500">Ideas Submitted</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">${stats.total_funded}</div>
          <div className="text-xs text-gray-500">Funded</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{stats.approved_builds}</div>
          <div className="text-xs text-gray-500">Builds</div>
        </div>
      </div>

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
          Votes
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
                    <span className="text-emerald-400 font-medium">${(idea.pool * 0.1).toFixed(0)} (10%)</span>
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
          {isWithdrawConfirmed && (
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
                  </div>
                </div>

                {/* Refund section for open ideas */}
                {f.idea_status === "open" && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    {f.refund_eligible ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleWithdraw(f.idea_id);
                        }}
                        disabled={withdrawingIdeaId === f.idea_id || isWithdrawConfirming}
                        className="w-full bg-orange-600 hover:bg-orange-500 disabled:bg-gray-600 text-white py-2 rounded-lg text-sm font-medium"
                      >
                        {withdrawingIdeaId === f.idea_id || isWithdrawConfirming
                          ? "Processing..."
                          : "Claim Refund"}
                      </button>
                    ) : (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Refund available in:</span>
                        <span className="text-orange-400 font-medium">
                          {f.days_until_refund} day{f.days_until_refund !== 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
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
          <p className="text-gray-500 text-sm py-4">Voting feature coming soon.</p>
        </div>
      )}

      {/* Pending Votes Banner */}
      {pendingVotes.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span>🗳️</span>
            <span className="text-yellow-300 font-medium">{pendingVotes.length} pending vote{pendingVotes.length > 1 ? "s" : ""}</span>
          </div>
          <p className="text-sm text-gray-300">{pendingVotes[0].idea_title} needs your vote</p>
          <button className="mt-2 w-full bg-yellow-600 hover:bg-yellow-500 text-white py-2 rounded-lg font-medium">
            Vote Now
          </button>
        </div>
      )}
    </div>
  );
}
