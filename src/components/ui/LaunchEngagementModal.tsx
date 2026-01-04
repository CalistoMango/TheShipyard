"use client";

import { useMiniApp } from "@neynar/react";
import sdk from "@farcaster/miniapp-sdk";
import { APP_URL, LAUNCH_CAST_HASH, PLATFORM_FID } from "~/lib/constants";

interface LaunchEngagementModalProps {
  onClose: () => void;
}

export function LaunchEngagementModal({ onClose }: LaunchEngagementModalProps) {
  const { actions, added, notificationDetails } = useMiniApp();

  const handleViewLaunchCast = async () => {
    try {
      if (LAUNCH_CAST_HASH) {
        await sdk.actions.viewCast({ hash: LAUNCH_CAST_HASH });
      } else {
        // Fallback to @theshipyard profile if no cast hash set
        await sdk.actions.viewProfile({ fid: PLATFORM_FID });
      }
    } catch {
      // Fallback to URL if SDK action fails
      if (LAUNCH_CAST_HASH) {
        sdk.actions.openUrl(`https://farcaster.xyz/theshipyard/${LAUNCH_CAST_HASH}`);
      } else {
        sdk.actions.openUrl(APP_URL);
      }
    }
  };

  const handleAddMiniApp = async () => {
    try {
      await actions.addMiniApp();
    } catch (error) {
      console.error("Failed to add mini app:", error);
    }
  };

  const handleFollowAccount = async () => {
    try {
      await sdk.actions.viewProfile({ fid: PLATFORM_FID });
    } catch {
      sdk.actions.openUrl("https://farcaster.xyz/theshipyard");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full">
        <h2 className="text-xl font-bold text-white mb-2">Welcome to The Shipyard!</h2>
        <p className="text-gray-400 text-sm mb-6">
          Help us spread the word and never miss a bounty opportunity.
        </p>

        <div className="space-y-4">
          {/* Follow Account */}
          <button
            onClick={handleFollowAccount}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 px-4 rounded-lg flex items-center gap-3 transition-colors"
          >
            <span className="text-2xl">👥</span>
            <div className="text-left">
              <div className="font-medium">Follow @theshipyard</div>
              <div className="text-xs text-gray-400">Stay updated on new bounties</div>
            </div>
          </button>

          {/* Like & Recast */}
          <button
            onClick={handleViewLaunchCast}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 px-4 rounded-lg flex items-center gap-3 transition-colors"
          >
            <span className="text-2xl">💜</span>
            <div className="text-left">
              <div className="font-medium">Like & Recast</div>
              <div className="text-xs text-gray-400">Support our launch post</div>
            </div>
          </button>

          {/* Add Mini App */}
          <button
            onClick={handleAddMiniApp}
            disabled={added}
            className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700/50 text-white py-3 px-4 rounded-lg flex items-center gap-3 transition-colors"
          >
            <span className="text-2xl">{added ? "✅" : "📱"}</span>
            <div className="text-left">
              <div className="font-medium">
                {added ? "Mini App Added" : "Add Mini App"}
              </div>
              <div className="text-xs text-gray-400">
                {added ? "Already saved to your client" : "Save to your Farcaster client"}
              </div>
            </div>
          </button>

          {/* Notifications Status */}
          <div className="w-full bg-gray-700/50 text-white py-3 px-4 rounded-lg flex items-center gap-3">
            <span className="text-2xl">{notificationDetails ? "🔔" : "🔕"}</span>
            <div className="text-left">
              <div className="font-medium">Notifications</div>
              <div className="text-xs text-gray-400">
                {notificationDetails
                  ? "Enabled - you'll get bounty alerts"
                  : "Enable in your Farcaster client settings"}
              </div>
            </div>
          </div>
        </div>

        {/* Dismiss */}
        <button
          onClick={onClose}
          className="w-full mt-6 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-medium transition-colors"
        >
          Access The Shipyard
        </button>
      </div>
    </div>
  );
}
