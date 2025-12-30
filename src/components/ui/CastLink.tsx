"use client";

import sdk from "@farcaster/miniapp-sdk";
import type { ReactNode } from "react";

interface CastLinkProps {
  castHash: string;
  children: ReactNode;
  className?: string;
}

export function CastLink({ castHash, children, className = "" }: CastLinkProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Open the cast conversation in Warpcast
    sdk.actions.openUrl(`https://warpcast.com/~/conversations/${castHash}`);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`hover:underline ${className}`}
    >
      {children}
    </button>
  );
}
