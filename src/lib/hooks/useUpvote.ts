"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface UpvoteStatus {
  upvoted: boolean;
}

interface UpvoteResult {
  status: "added" | "removed";
  upvoted: boolean;
  upvote_count: number;
}

async function checkUpvoteStatus(
  ideaId: number,
  userFid: number
): Promise<UpvoteStatus> {
  const res = await fetch(`/api/ideas/${ideaId}/upvote?user_fid=${userFid}`);
  if (!res.ok) {
    throw new Error("Failed to check upvote status");
  }
  return res.json();
}

async function toggleUpvote(
  ideaId: number,
  userFid: number
): Promise<UpvoteResult> {
  const res = await fetch(`/api/ideas/${ideaId}/upvote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_fid: userFid }),
  });
  if (!res.ok) {
    throw new Error("Failed to toggle upvote");
  }
  return res.json();
}

export function useUpvoteStatus(ideaId: number, userFid: number | null) {
  return useQuery({
    queryKey: ["upvote", ideaId, userFid],
    queryFn: () => checkUpvoteStatus(ideaId, userFid!),
    enabled: !!userFid,
  });
}

export function useToggleUpvote(ideaId: number, userFid: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => toggleUpvote(ideaId, userFid),
    onSuccess: (result) => {
      // Update upvote status cache
      queryClient.setQueryData(["upvote", ideaId, userFid], {
        upvoted: result.upvoted,
      });

      // Invalidate ideas list to refresh upvote counts
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      queryClient.invalidateQueries({ queryKey: ["idea", ideaId] });
    },
  });
}
