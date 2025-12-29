"use client";

export function DashboardTab() {

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">My Activity</h2>

      {/* Stats Overview */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">3</div>
          <div className="text-xs text-gray-500">Ideas Submitted</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">$125</div>
          <div className="text-xs text-gray-500">Funded</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">2</div>
          <div className="text-xs text-gray-500">Builds</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-700">
        <button className="pb-2 border-b-2 border-white text-white font-medium">My Ideas</button>
        <button className="pb-2 text-gray-400">Funded</button>
        <button className="pb-2 text-gray-400">Building</button>
        <button className="pb-2 text-gray-400">Votes</button>
      </div>

      {/* My Ideas List */}
      <div className="space-y-3">
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-white">Channel Analytics Dashboard</h4>
              <p className="text-gray-500 text-sm">Submitted 5 days ago</p>
            </div>
            <div className="text-right">
              <div className="text-emerald-400 font-bold">$180</div>
              <div className="text-gray-500 text-xs">pool</div>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-700 flex items-center justify-between">
            <span className="text-gray-400 text-sm">Potential earnings:</span>
            <span className="text-emerald-400 font-medium">$18 (10%)</span>
          </div>
        </div>
      </div>

      {/* Pending Votes */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <span>🗳️</span>
          <span className="text-yellow-300 font-medium">1 pending vote</span>
        </div>
        <p className="text-sm text-gray-300">NFT Portfolio Tracker needs your vote</p>
        <button className="mt-2 w-full bg-yellow-600 hover:bg-yellow-500 text-white py-2 rounded-lg font-medium">
          Vote Now
        </button>
      </div>
    </div>
  );
}
