"use client";

import { recentBuilds } from "~/lib/mockData";

export function ProfileTab() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Builder Profile</h2>

      {/* Profile Header */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full" />
          <div>
            <h3 className="text-xl font-bold text-white">speedbuilder.eth</h3>
            <p className="text-gray-400">Joined 3 months ago</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 py-4 border-t border-gray-700">
          <div className="text-center">
            <div className="text-2xl font-bold text-white">12</div>
            <div className="text-xs text-gray-500">Bounties</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-400">$2,450</div>
            <div className="text-xs text-gray-500">Earned</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white">92%</div>
            <div className="text-xs text-gray-500">Success</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-400">3🔥</div>
            <div className="text-xs text-gray-500">Streak</div>
          </div>
        </div>

        {/* Badges */}
        <div className="flex gap-2 mt-4 flex-wrap">
          <span className="px-3 py-1 bg-yellow-500/20 text-yellow-300 rounded-full text-sm">🏆 First Claim</span>
          <span className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm">⚡ Speed Demon</span>
          <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-sm">💎 Quality</span>
        </div>
      </div>

      {/* Recent Builds */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
        <h3 className="font-semibold text-white mb-3">Recent Builds</h3>
        <div className="space-y-3">
          {recentBuilds.map((b, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
              <div>
                <div className="text-white font-medium">{b.title}</div>
                <div className="text-gray-500 text-xs">{b.days} days ago</div>
              </div>
              <div className="text-emerald-400 font-medium">${b.earned}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
