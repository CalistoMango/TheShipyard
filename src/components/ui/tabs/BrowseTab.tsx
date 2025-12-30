"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import sdk from "@farcaster/miniapp-sdk";
import type { Idea, Category } from "~/lib/types";
import { useInfiniteIdeas } from "~/lib/hooks/useIdeas";

interface BrowseTabProps {
  onSelectIdea: (idea: Idea) => void;
}

type SortOption = "trending" | "funded" | "upvoted" | "newest";

const categories = ["all", "games", "tools", "social", "defi", "content", "other"] as const;

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
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Fetch ideas with infinite scroll
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteIdeas({
    category: activeFilter as Category | "all",
    sort: activeSort,
  });

  // Flatten all pages into single array
  const ideas = data?.pages.flatMap((page) => page.data) || [];
  const total = data?.pages[0]?.total || 0;
  const totalPoolValue = ideas.reduce((sum, idea) => sum + idea.pool, 0);

  // Intersection Observer for infinite scroll
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  );

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(handleObserver, {
      threshold: 0.1,
      rootMargin: "100px",
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [handleObserver]);

  // Find idea in voting status for race mode banner
  const raceIdea = ideas.find((i) => i.status === "voting");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/logo-black.png"
            alt="The Shipyard"
            className="w-10 h-10"
          />
          <div>
            <h1 className="text-2xl font-bold text-white">The Shipyard</h1>
            <p className="text-gray-400 text-sm">Fund ideas. Race to build. Claim the pool.</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-emerald-400 font-bold text-lg leading-tight">
                ${totalPoolValue.toLocaleString()}
              </div>
              <div className="text-gray-500 text-xs">total in pools</div>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <span className="text-lg">💰</span>
            </div>
          </div>
          <button
            onClick={() => setIsHelpOpen(true)}
            className="text-gray-500 hover:text-gray-300 text-xs underline transition-colors"
          >
            How it works
          </button>
        </div>
      </div>

      {/* Help Modal */}
      {isHelpOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">How It Works</h2>
              <button
                onClick={() => setIsHelpOpen(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4 text-gray-300 text-sm">
              <div>
                <h3 className="font-semibold text-white mb-1">What is The Shipyard?</h3>
                <p>
                  A platform where the Farcaster community crowdfunds ideas for mini apps.
                  Submit ideas, fund the ones you want built, and earn rewards when they ship.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-1">How to Submit an Idea</h3>
                <p>
                  Post your idea in the{" "}
                  <span
                    className="text-blue-400 cursor-pointer hover:underline"
                    onClick={async () => {
                      setIsHelpOpen(false);
                      try {
                        await sdk.actions.viewChannel({ channelId: "someone-build" });
                      } catch {
                        // Fallback to openUrl if viewChannel is not available
                        sdk.actions.openUrl("https://warpcast.com/~/channel/someone-build");
                      }
                    }}
                  >
                    /someone-build
                  </span>{" "}
                  channel on Farcaster. It will automatically appear here!
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-1">How Funding Works</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>Anyone can fund ideas they want built</li>
                  <li>70% of the pool goes to the builder</li>
                  <li>10% goes to the idea submitter</li>
                  <li>20% goes to the platform</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-1">Building an Idea</h3>
                <p>
                  Find an idea you can build, submit your implementation, and if the community
                  approves it, you claim the bounty pool!
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-1">Upvoting</h3>
                <p>
                  Upvote ideas you want to see built. Popular ideas get more visibility
                  and attract more funding.
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsHelpOpen(false)}
              className="w-full mt-6 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-medium"
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="relative">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide pr-8">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                activeFilter === cat
                  ? "bg-white text-gray-900"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
        {/* Fade gradient to hint at scrollable content */}
        <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-gray-900 to-transparent pointer-events-none" />
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

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-8 text-gray-400">
          Loading ideas...
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="text-center py-8 text-red-400">
          Failed to load ideas. Please try again.
        </div>
      )}

      {/* Ideas List */}
      {!isLoading && !error && (
        <div className="space-y-3">
          {ideas.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              No ideas found.
            </div>
          ) : (
            <>
              {ideas.map((idea) => (
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

              {/* Load more trigger / status */}
              <div ref={loadMoreRef} className="py-4 text-center text-sm text-gray-500">
                {isFetchingNextPage ? (
                  "Loading more..."
                ) : hasNextPage ? (
                  `Showing ${ideas.length} of ${total} ideas`
                ) : (
                  `All ${total} ideas loaded`
                )}
              </div>
            </>
          )}
        </div>
      )}

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
