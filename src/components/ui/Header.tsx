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
      </div>
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
