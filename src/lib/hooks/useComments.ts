"use client";

import { useQuery } from "@tanstack/react-query";
import type { Comment } from "~/lib/types";

interface CommentsResponse {
  data: Comment[];
  cast_url: string | null;
  message?: string;
}

async function fetchComments(ideaId: number): Promise<CommentsResponse> {
  const res = await fetch(`/api/ideas/${ideaId}/comments`);
  if (!res.ok) {
    throw new Error("Failed to fetch comments");
  }
  return res.json();
}

export function useComments(ideaId: number) {
  return useQuery({
    queryKey: ["comments", ideaId],
    queryFn: () => fetchComments(ideaId),
    staleTime: 60 * 1000, // Consider comments stale after 1 minute
  });
}
