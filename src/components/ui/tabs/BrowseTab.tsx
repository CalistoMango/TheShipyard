"use client";

import { useState } from "react";
import type { Idea, Category } from "~/lib/types";
import { ideas, categories, totalPoolValue } from "~/lib/mockData";

interface BrowseTabProps {
  onSelectIdea: (idea: Idea) => void;
}

type SortOption = "trending" | "funded" | "upvoted" | "newest";

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

export function BrowseTab({ onSelectIdea }: BrowseTabProps) {
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [activeSort, setActiveSort] = useState<SortOption>("trending");

  const filteredIdeas = activeFilter === "all"
    ? ideas
    : ideas.filter((i) => i.category === activeFilter);

  // The NFT Portfolio Tracker is in "voting" status - show it in race mode
  const raceIdea = ideas.find((i) => i.status === "voting");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">The Shipyard</h1>
          <p className="text-gray-400 text-sm">Fund ideas. Race to build. Claim the pool.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full text-sm font-medium">
            ${totalPoolValue.toLocaleString()} in pools
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveFilter(cat)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              activeFilter === cat
                ? "bg-white text-gray-900"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div className="flex gap-4 text-sm">
        <button
          onClick={() => setActiveSort("trending")}
          className={activeSort === "trending" ? "text-white font-medium" : "text-gray-400 hover:text-white"}
        >
          🔥 Trending
        </button>
        <button
          onClick={() => setActiveSort("funded")}
          className={activeSort === "funded" ? "text-white font-medium" : "text-gray-400 hover:text-white"}
        >
          💰 Most Funded
        </button>
        <button
          onClick={() => setActiveSort("upvoted")}
          className={activeSort === "upvoted" ? "text-white font-medium" : "text-gray-400 hover:text-white"}
        >
          ⬆️ Most Upvoted
        </button>
        <button
          onClick={() => setActiveSort("newest")}
          className={activeSort === "newest" ? "text-white font-medium" : "text-gray-400 hover:text-white"}
        >
          🆕 Newest
        </button>
      </div>

      {/* Ideas List */}
      <div className="space-y-3">
        {filteredIdeas.map((idea) => (
          <div
            key={idea.id}
            onClick={() => onSelectIdea(idea)}
            className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 hover:border-gray-600 cursor-pointer transition-all"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-white truncate">{idea.title}</h3>
                  {getStatusBadge(idea.status)}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${getCategoryColor(idea.category)}`}>
                    {idea.category}
                  </span>
                  <span className="text-gray-500">by {idea.submitter}</span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-center">
                  <div className="text-emerald-400 font-bold">${idea.pool}</div>
                  <div className="text-gray-500 text-xs">pool</div>
                </div>
                <div className="text-center">
                  <div className="text-white font-medium">{idea.upvotes}</div>
                  <div className="text-gray-500 text-xs">upvotes</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Race Mode Banner */}
      {raceIdea && (
        <div className="bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏁</span>
            <div className="flex-1">
              <div className="font-semibold text-orange-300">Race Mode Active!</div>
              <div className="text-sm text-gray-300">{raceIdea.title} — ${raceIdea.pool} pool</div>
            </div>
            <button
              onClick={() => onSelectIdea(raceIdea)}
              className="bg-orange-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-orange-600"
            >
              View Race
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
