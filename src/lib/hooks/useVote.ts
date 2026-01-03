"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authPost } from "~/lib/api";

interface VoteResult {
  status: "voted";
  approved: boolean;
  votes_approve: number;
  votes_reject: number;
}

async function castVote(
  buildId: string,
  voterFid: number,
  approved: boolean
): Promise<VoteResult> {
  const res = await authPost(`/api/builds/${buildId}/vote`, {
    voter_fid: voterFid,
    approved,
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to cast vote");
  }
  return res.json();
}

export function useCastVote(buildId: string, ideaId: number, voterFid: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (approved: boolean) => castVote(buildId, voterFid, approved),
    onSuccess: () => {
      // Invalidate idea detail to refresh VotingSection
      queryClient.invalidateQueries({ queryKey: ["idea", ideaId] });

      // Invalidate ideas lists to refresh hasVotingBuilds badge
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      queryClient.invalidateQueries({ queryKey: ["ideas-infinite"] });
    },
  });
}
