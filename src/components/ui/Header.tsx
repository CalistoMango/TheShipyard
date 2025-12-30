"use client";

import { useState } from "react";
import sdk from "@farcaster/miniapp-sdk";
import { useMiniApp } from "@neynar/react";

type HeaderProps = {
  neynarUser?: {
    fid: number;
    score: number;
  } | null;
};

export function Header({ neynarUser }: HeaderProps) {
  const { context } = useMiniApp();
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  return (
    <div className="relative">
      <div className="px-4 py-3 flex items-center justify-between">
        {context?.user && (
          <div
            className="cursor-pointer"
            onClick={() => {
              setIsUserDropdownOpen(!isUserDropdownOpen);
            }}
          >
            {context.user.pfpUrl ? (
              <img
                src={context.user.pfpUrl}
                alt="Profile"
                className="w-10 h-10 rounded-full border-2 border-gray-700"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500" />
            )}
          </div>
        )}
        {!context?.user && (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500" />
        )}

        {/* Help Button */}
        <button
          onClick={() => setIsHelpOpen(true)}
          className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
        >
          ?
        </button>
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
                    onClick={() => {
                      sdk.actions.openUrl("https://warpcast.com/~/channel/someone-build");
                      setIsHelpOpen(false);
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
      {context?.user && isUserDropdownOpen && (
        <div className="absolute top-full left-4 z-50 w-fit mt-1 bg-gray-800 rounded-lg shadow-lg border border-gray-700">
          <div className="p-3 space-y-2">
            <div className="text-left">
              <h3
                className="font-bold text-sm text-white hover:underline cursor-pointer inline-block"
                onClick={() => sdk.actions.viewProfile({ fid: context.user.fid })}
              >
                {context.user.displayName || context.user.username}
              </h3>
              <p className="text-xs text-gray-400">@{context.user.username}</p>
              <p className="text-xs text-gray-500">FID: {context.user.fid}</p>
              {neynarUser && (
                <p className="text-xs text-gray-500">Neynar Score: {neynarUser.score}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
