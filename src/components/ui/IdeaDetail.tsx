"use client";

import type { Idea, Category } from "~/lib/types";
import { comments, fundingHistory } from "~/lib/mockData";

interface IdeaDetailProps {
  idea: Idea;
  onBack: () => void;
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

function VotingSection() {
  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">🗳️</span>
        <h3 className="font-semibold text-yellow-300">Voting in Progress</h3>
      </div>
      <p className="text-gray-300 text-sm mb-3">
        <span className="text-white font-medium">speedbuilder.eth</span> submitted a build. Vote to approve or reject.
      </p>
      <div className="bg-gray-800 rounded-lg p-3 mb-3">
        <a href="#" className="text-blue-400 text-sm hover:underline">View submitted app ↗</a>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 bg-gray-700 rounded-full h-3 overflow-hidden">
          <div className="bg-green-500 h-full" style={{ width: "68%" }} />
        </div>
        <span className="text-sm text-gray-400">68% approve</span>
      </div>
      <div className="flex gap-3">
        <button className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg font-medium">
          ✓ Approve
        </button>
        <button className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg font-medium">
          ✕ Reject
        </button>
      </div>
      <p className="text-gray-500 text-xs mt-3 text-center">23h 14m remaining</p>
    </div>
  );
}

export function IdeaDetail({ idea, onBack }: IdeaDetailProps) {
  return (
    <div className="space-y-4">
      {/* Back button */}
      <button
        onClick={onBack}
        className="text-gray-400 hover:text-white text-sm flex items-center gap-1"
      >
        ← Back to ideas
      </button>

      {/* Header */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-xl font-bold text-white">{idea.title}</h1>
              {getStatusBadge(idea.status)}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className={`px-2 py-0.5 rounded-full text-xs ${getCategoryColor(idea.category)}`}>
                {idea.category}
              </span>
              <span className="text-gray-400">submitted by</span>
              <span className="text-white font-medium">{idea.submitter}</span>
            </div>
          </div>
          <button className="text-gray-400 hover:text-white p-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
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
            <div className="text-2xl font-bold text-white">{idea.upvotes}</div>
            <div className="text-xs text-gray-500">Upvotes</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-400">{comments.length}</div>
            <div className="text-xs text-gray-500">Comments</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-4">
          <button className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2">
            ⬆️ Upvote
          </button>
          <button className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2">
            💰 Fund
          </button>
          <button className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2">
            🚀 Submit Build
          </button>
        </div>
      </div>

      {/* Voting Section (if voting) */}
      {idea.status === "voting" && <VotingSection />}

      {/* Funding History */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
        <h3 className="font-semibold text-white mb-3">Recent Funding</h3>
        <div className="space-y-2">
          {fundingHistory.map((entry, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-gray-300">{entry.user}</span>
              <span className="text-emerald-400">+${entry.amount}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Comments (from FC) */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-white">Discussion</h3>
          <a href="#" className="text-blue-400 text-sm hover:underline">Reply on Farcaster ↗</a>
        </div>
        <div className="space-y-3">
          {comments.map((c, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium text-sm">{c.user}</span>
                  <span className="text-gray-500 text-xs">{c.time}</span>
                </div>
                <p className="text-gray-300 text-sm">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
