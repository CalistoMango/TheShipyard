"use client";

import sdk from "@farcaster/miniapp-sdk";
import type { ReactNode } from "react";

interface ProfileLinkProps {
  fid: number;
  children: ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function ProfileLink({ fid, children, className = "", onClick }: ProfileLinkProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClick?.(e);
    sdk.actions.viewProfile({ fid });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`hover:text-blue-400 transition-colors ${className}`}
    >
      {children}
    </button>
  );
}
