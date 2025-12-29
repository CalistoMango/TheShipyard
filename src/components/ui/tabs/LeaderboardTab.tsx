"use client";

import { builders, topIdeaSubmitters } from "~/lib/mockData";

function getRankStyle(index: number): string {
  if (index === 0) return "bg-yellow-500 text-yellow-900";
  if (index === 1) return "bg-gray-400 text-gray-900";
  return "bg-orange-700 text-orange-200";
}

export function LeaderboardTab() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Leaderboards</h2>

      {/* Top Builders */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
        <h3 className="font-semibold text-white mb-3">🏆 Top Builders</h3>
        <div className="space-y-3">
          {builders.map((b, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${getRankStyle(i)}`}
              >
                {i + 1}
              </div>
              <div className="flex-1">
                <div className="text-white font-medium">{b.name}</div>
                <div className="text-gray-500 text-xs">{b.claimed} bounties</div>
              </div>
              <div className="text-emerald-400 font-bold">${b.earned}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Ideas */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
        <h3 className="font-semibold text-white mb-3">💡 Top Idea Submitters</h3>
        <div className="space-y-3">
          {topIdeaSubmitters.map((u, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${getRankStyle(i)}`}
              >
                {i + 1}
              </div>
              <div className="flex-1">
                <div className="text-white font-medium">{u.name}</div>
                <div className="text-gray-500 text-xs">{u.ideas} ideas built</div>
              </div>
              <div className="text-emerald-400 font-bold">${u.earnings}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
