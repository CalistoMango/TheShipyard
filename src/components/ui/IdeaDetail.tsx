"use client";

import { useEffect, useState } from "react";
import { useMiniApp } from "@neynar/react";
import sdk from "@farcaster/miniapp-sdk";
import type { Idea, Category, FundingEntry, WinningBuild, Comment } from "~/lib/types";
import { ProfileLink } from "~/components/ui/ProfileLink";
import { CastLink } from "~/components/ui/CastLink";
import { APP_URL } from "~/lib/constants";

interface IdeaDetailProps {
  idea: Idea;
  onBack: () => void;
}

interface IdeaDetailData {
  idea: Idea;
  fundingHistory: FundingEntry[];
  totalFunders: number;
  winningBuild: WinningBuild | null;
}

const getCategoryColor = (cat: Category): string => {
  const colors: Record<Category, string> = {
    games: "bg-purple-500/20 text-purple-300",
    tools: "bg-blue-500/20 text-blue-300",
    social: "bg-pink-500/20 text-pink-300",
    defi: "bg-green-500/20 text-green-300",
    content: "bg-orange-500/20 text-orange-300",
    other: "bg-gray-500/20 text-gray-300",
  };
  return colors[cat] || colors.other;
};

const getStatusBadge = (status: string) => {
  if (status === "voting") {
    return <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-300 text-xs rounded-full">🗳️ Voting</span>;
  }
  if (status === "completed") {
    return <span className="px-2 py-0.5 bg-green-500/20 text-green-300 text-xs rounded-full">✅ Built</span>;
  }
  return null;
};

function VotingSection({ ideaId: _ideaId }: { ideaId: number }) {
  // TODO: Fetch actual build data for voting using _ideaId
  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">🗳️</span>
        <h3 className="font-semibold text-yellow-300">Voting in Progress</h3>
      </div>
      <p className="text-gray-300 text-sm mb-3">
        A build has been submitted for this idea. Community voting is in progress.
      </p>
      <div className="flex gap-3">
        <button className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg font-medium">
          ✓ Approve
        </button>
        <button className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg font-medium">
          ✕ Reject
        </button>
      </div>
    </div>
  );
}

function CompletedSection({ winningBuild, solutionUrl }: { winningBuild: WinningBuild | null; solutionUrl: string | null }) {
  const url = winningBuild?.url || solutionUrl;
  const builder = winningBuild?.builder;

  if (!url) return null;

  return (
    <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">✅</span>
        <h3 className="font-semibold text-green-300">This idea has been built!</h3>
      </div>
      {builder && (
        <p className="text-gray-300 text-sm mb-3">
          Built by <span className="text-white font-medium">{builder}</span>
        </p>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg font-medium text-center"
      >
        View App ↗
      </a>
    </div>
  );
}

export function IdeaDetail({ idea: initialIdea, onBack }: IdeaDetailProps) {
  const { context } = useMiniApp();
  const [detailData, setDetailData] = useState<IdeaDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasUpvoted, setHasUpvoted] = useState(false);
  const [upvoteCount, setUpvoteCount] = useState(initialIdea.upvotes);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showFundModal, setShowFundModal] = useState(false);
  const [showBuildModal, setShowBuildModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const [buildUrl, setBuildUrl] = useState("");
  const [buildDescription, setBuildDescription] = useState("");
  const [reportUrl, setReportUrl] = useState("");
  const [reportNote, setReportNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  const userFid = context?.user?.fid;

  useEffect(() => {
    async function fetchIdeaDetail() {
      setLoading(true);
      try {
        const res = await fetch(`/api/ideas/${initialIdea.id}`);
        if (res.ok) {
          const data = await res.json();
          setDetailData(data.data);
          setUpvoteCount(data.data.idea.upvotes);
        }

        // Check if user has upvoted
        if (userFid) {
          const upvoteRes = await fetch(`/api/ideas/${initialIdea.id}/upvote?user_fid=${userFid}`);
          if (upvoteRes.ok) {
            const upvoteData = await upvoteRes.json();
            setHasUpvoted(upvoteData.upvoted);
          }
        }
      } catch (error) {
        console.error("Failed to fetch idea details:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchIdeaDetail();
  }, [initialIdea.id, userFid]);

  // Fetch comments (replies from Farcaster)
  useEffect(() => {
    async function fetchComments() {
      if (!initialIdea.cast_hash) return;

      setCommentsLoading(true);
      try {
        const res = await fetch(`/api/ideas/${initialIdea.id}/comments`);
        if (res.ok) {
          const data = await res.json();
          setComments(data.data || []);
        }
      } catch (error) {
        console.error("Failed to fetch comments:", error);
      } finally {
        setCommentsLoading(false);
      }
    }

    fetchComments();
  }, [initialIdea.id, initialIdea.cast_hash]);

  const handleUpvote = async () => {
    if (!userFid) {
      setActionError("Please open this app in Farcaster to upvote");
      return;
    }

    setActionLoading("upvote");
    setActionError(null);

    try {
      const res = await fetch(`/api/ideas/${initialIdea.id}/upvote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_fid: userFid }),
      });

      const data = await res.json();

      if (res.ok) {
        setHasUpvoted(data.upvoted);
        setUpvoteCount(data.upvote_count);
      } else {
        setActionError(data.error || "Failed to upvote");
      }
    } catch (error) {
      console.error("Upvote error:", error);
      setActionError("Failed to upvote");
    } finally {
      setActionLoading(null);
    }
  };

  const handleFund = async () => {
    if (!userFid) {
      setActionError("Please open this app in Farcaster to fund");
      return;
    }

    const amount = parseFloat(fundAmount);
    if (isNaN(amount) || amount < 1) {
      setActionError("Minimum funding amount is $1");
      return;
    }

    setActionLoading("fund");
    setActionError(null);

    try {
      const res = await fetch(`/api/ideas/${initialIdea.id}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_fid: userFid, amount }),
      });

      const data = await res.json();

      if (res.ok) {
        setShowFundModal(false);
        setFundAmount("");
        // Refresh data
        const refreshRes = await fetch(`/api/ideas/${initialIdea.id}`);
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          setDetailData(refreshData.data);
        }
      } else {
        setActionError(data.error || "Failed to fund");
      }
    } catch (error) {
      console.error("Fund error:", error);
      setActionError("Failed to fund");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSubmitBuild = async () => {
    if (!userFid) {
      setActionError("Please open this app in Farcaster to submit a build");
      return;
    }

    if (!buildUrl) {
      setActionError("Please enter your app URL");
      return;
    }

    setActionLoading("build");
    setActionError(null);

    try {
      const res = await fetch("/api/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea_id: initialIdea.id,
          builder_fid: userFid,
          url: buildUrl,
          description: buildDescription || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setShowBuildModal(false);
        setBuildUrl("");
        setBuildDescription("");
        setActionError(null);
        alert("Build submitted for review!");
      } else {
        setActionError(data.error || "Failed to submit build");
      }
    } catch (error) {
      console.error("Build submission error:", error);
      setActionError("Failed to submit build");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReport = async () => {
    if (!userFid) {
      setActionError("Please sign in to report");
      return;
    }
    if (!reportUrl.trim()) {
      setActionError("Please provide a URL to the existing solution");
      return;
    }

    setActionLoading("report");
    setActionError(null);

    try {
      const res = await fetch(`/api/ideas/${initialIdea.id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: reportUrl,
          note: reportNote || undefined,
          reporter_fid: userFid,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setShowReportModal(false);
        setReportUrl("");
        setReportNote("");
        setActionError(null);
        alert("Report submitted! An admin will review it.");
      } else {
        setActionError(data.error || "Failed to submit report");
      }
    } catch (error) {
      console.error("Report submission error:", error);
      setActionError("Failed to submit report");
    } finally {
      setActionLoading(null);
    }
  };

  // Use fetched data if available, otherwise fall back to initial
  const idea = detailData?.idea || initialIdea;
  const fundingHistory = detailData?.fundingHistory || [];
  const totalFunders = detailData?.totalFunders || 0;
  const winningBuild = detailData?.winningBuild || null;

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button
        onClick={onBack}
        className="text-gray-400 hover:text-white text-sm flex items-center gap-1"
      >
        ← Back to ideas
      </button>

      {/* Error message */}
      {actionError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-300 text-sm">
          {actionError}
        </div>
      )}

      {/* Header */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-xl font-bold text-white">{idea.title}</h1>
              {getStatusBadge(idea.status)}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className={`px-2 py-0.5 rounded-full text-xs ${getCategoryColor(idea.category)}`}>
                {idea.category}
              </span>
              <span className="text-gray-400">by</span>
              {idea.submitter_pfp ? (
                <img src={idea.submitter_pfp} alt="" className="w-5 h-5 rounded-full" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500" />
              )}
              {idea.submitter_fid ? (
                <ProfileLink fid={idea.submitter_fid} className="text-white font-medium">
                  {idea.submitter}
                </ProfileLink>
              ) : (
                <span className="text-white font-medium">{idea.submitter}</span>
              )}
            </div>
          </div>
          <button
            onClick={() => {
              const shareUrl = `${APP_URL}/?idea=${idea.id}`;
              const submitterMention = idea.submitter_username ? `@${idea.submitter_username}` : idea.submitter;
              const shareText = `Check out "${idea.title}" by ${submitterMention} on The Shipyard!\n\nFund this idea or build it to claim the $${idea.pool} bounty pool.`;
              sdk.actions.composeCast({
                text: shareText,
                embeds: [shareUrl],
              });
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            Share
          </button>
        </div>

        <p className="text-gray-300 mb-4">{idea.description}</p>

        {/* Stats */}
        <div className="flex items-center gap-6 py-3 border-t border-gray-700">
          <div>
            <div className="text-2xl font-bold text-emerald-400">${idea.pool}</div>
            <div className="text-xs text-gray-500">USDC Pool</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{upvoteCount}</div>
            <div className="text-xs text-gray-500">Upvotes</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-400">{totalFunders}</div>
            <div className="text-xs text-gray-500">Funders</div>
          </div>
        </div>

        {/* Actions - only show for open ideas */}
        {idea.status === "open" && (
          <div className="space-y-3 mt-4">
            {/* Primary actions row */}
            <div className="flex gap-3">
              <button
                onClick={handleUpvote}
                disabled={actionLoading === "upvote"}
                className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors ${
                  hasUpvoted
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-700 hover:bg-gray-600 text-white"
                }`}
              >
                {actionLoading === "upvote" ? "..." : hasUpvoted ? "✓ Upvoted" : "⬆️ Upvote"}
              </button>
              <button
                onClick={() => setShowFundModal(true)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2"
              >
                💰 Fund
              </button>
            </div>
            {/* Submit Build - full width */}
            <button
              onClick={() => setShowBuildModal(true)}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2"
            >
              🚀 Submit Build
            </button>
            {/* Already Built button */}
            <button
              onClick={() => setShowReportModal(true)}
              className="w-full bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-600/40 text-yellow-300 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
            >
              🚩 Already Built? Report Existing Solution
            </button>
          </div>
        )}
      </div>

      {/* Fund Modal */}
      {showFundModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-4">Fund this idea</h3>
            <p className="text-gray-400 text-sm mb-4">
              Contribute USDC to the pool. 70% goes to the builder, 10% to the idea submitter.
            </p>
            <input
              type="number"
              min="1"
              step="1"
              placeholder="Amount (min $1)"
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowFundModal(false);
                  setFundAmount("");
                  setActionError(null);
                }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleFund}
                disabled={actionLoading === "fund"}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-medium"
              >
                {actionLoading === "fund" ? "Processing..." : "Fund"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Build Modal */}
      {showBuildModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-4">Submit your build</h3>
            <p className="text-gray-400 text-sm mb-4">
              Share your implementation. It will be reviewed by the community.
            </p>
            <input
              type="url"
              placeholder="App URL (e.g. https://myapp.vercel.app)"
              value={buildUrl}
              onChange={(e) => setBuildUrl(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white mb-3"
            />
            <textarea
              placeholder="Description (optional)"
              value={buildDescription}
              onChange={(e) => setBuildDescription(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white mb-4 h-24 resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowBuildModal(false);
                  setBuildUrl("");
                  setBuildDescription("");
                  setActionError(null);
                }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitBuild}
                disabled={actionLoading === "build"}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-medium"
              >
                {actionLoading === "build" ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-4">Report existing solution</h3>
            <p className="text-gray-400 text-sm mb-4">
              Know of an app that already does this? Share the link and we&apos;ll review it.
            </p>
            <input
              type="url"
              placeholder="URL to existing solution"
              value={reportUrl}
              onChange={(e) => setReportUrl(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white mb-3"
            />
            <textarea
              placeholder="Additional notes (optional)"
              value={reportNote}
              onChange={(e) => setReportNote(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white mb-4 h-20 resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowReportModal(false);
                  setReportUrl("");
                  setReportNote("");
                  setActionError(null);
                }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleReport}
                disabled={actionLoading === "report"}
                className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white py-3 rounded-lg font-medium"
              >
                {actionLoading === "report" ? "Submitting..." : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Voting Section (if voting) */}
      {idea.status === "voting" && <VotingSection ideaId={idea.id} />}

      {/* Completed Section (if completed) */}
      {idea.status === "completed" && (
        <CompletedSection winningBuild={winningBuild} solutionUrl={idea.solution_url} />
      )}

      {/* Funding History */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
        <h3 className="font-semibold text-white mb-3">Recent Funding</h3>
        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : fundingHistory.length === 0 ? (
          <p className="text-gray-500 text-sm">No funding yet. Be the first to fund this idea!</p>
        ) : (
          <div className="space-y-2">
            {fundingHistory.map((entry, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                {entry.user_fid ? (
                  <ProfileLink fid={entry.user_fid} className="text-gray-300">
                    {entry.user}
                  </ProfileLink>
                ) : (
                  <span className="text-gray-300">{entry.user}</span>
                )}
                <span className="text-emerald-400">+${entry.amount}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Discussion Section */}
      {idea.cast_hash && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-white">Discussion</h3>
            <CastLink castHash={idea.cast_hash} className="text-blue-400 text-sm">
              View original cast →
            </CastLink>
          </div>

          {/* Recent Replies */}
          {commentsLoading ? (
            <p className="text-gray-500 text-sm">Loading replies...</p>
          ) : comments.length === 0 ? (
            <p className="text-gray-500 text-sm">No replies yet. Be the first to comment on Farcaster!</p>
          ) : (
            <div className="space-y-3">
              {comments.slice(0, 5).map((comment, i) => (
                <div key={i} className="border-t border-gray-700 pt-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span className="font-medium text-gray-300">{comment.user}</span>
                    <span>{comment.time}</span>
                  </div>
                  <p className="text-gray-300 text-sm">{comment.text}</p>
                </div>
              ))}
              {comments.length > 5 && (
                <CastLink castHash={idea.cast_hash} className="text-blue-400 text-sm block text-center pt-2">
                  View all {comments.length} replies →
                </CastLink>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
