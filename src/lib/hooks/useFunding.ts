"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { FundingEntry } from "~/lib/types";

interface FundingResponse {
  data: {
    pool: number;
    total_funders: number;
    funding_history: FundingEntry[];
  };
}

interface FundResult {
  status: "funded";
  funding_id: string;
  amount: number;
  new_pool_total: number;
  new_balance: number;
}

async function fetchFunding(ideaId: number): Promise<FundingResponse> {
  const res = await fetch(`/api/ideas/${ideaId}/fund`);
  if (!res.ok) {
    throw new Error("Failed to fetch funding");
  }
  return res.json();
}

async function fundIdea(
  ideaId: number,
  userFid: number,
  amount: number
): Promise<FundResult> {
  const res = await fetch(`/api/ideas/${ideaId}/fund`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_fid: userFid, amount }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to fund idea");
  }
  return res.json();
}

export function useFunding(ideaId: number) {
  return useQuery({
    queryKey: ["funding", ideaId],
    queryFn: () => fetchFunding(ideaId),
  });
}

export function useFundIdea(ideaId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userFid, amount }: { userFid: number; amount: number }) =>
      fundIdea(ideaId, userFid, amount),
    onSuccess: () => {
      // Invalidate funding and ideas queries
      queryClient.invalidateQueries({ queryKey: ["funding", ideaId] });
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      queryClient.invalidateQueries({ queryKey: ["idea", ideaId] });
    },
  });
}
