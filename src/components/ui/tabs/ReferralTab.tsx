"use client";

import { useMiniApp } from "@neynar/react";

export function ReferralTab() {
  const { context } = useMiniApp();

  // Not logged in via Farcaster
  if (!context?.user) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">Referral</h2>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 text-center">
          <p className="text-gray-400 mb-4">Open this app in Farcaster to view referral options.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Referral</h2>
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 text-center">
        <p className="text-gray-400">Referral program coming soon.</p>
      </div>
    </div>
  );
}
