"use client";

import { useQuery } from "@tanstack/react-query";
import type { Idea, Category, IdeaStatus } from "~/lib/types";

type SortMode = "trending" | "funded" | "upvoted" | "newest";

interface UseIdeasParams {
  category?: Category | "all";
  status?: IdeaStatus;
  sort?: SortMode;
  page?: number;
  pageSize?: number;
}

interface IdeasResponse {
  data: Idea[];
  total: number;
  page: number;
  pageSize: number;
}

async function fetchIdeas(params: UseIdeasParams): Promise<IdeasResponse> {
  const searchParams = new URLSearchParams();

  if (params.category && params.category !== "all") {
    searchParams.set("category", params.category);
  }
  if (params.status) {
    searchParams.set("status", params.status);
  }
  if (params.sort) {
    searchParams.set("sort", params.sort);
  }
  if (params.page) {
    searchParams.set("page", params.page.toString());
  }
  if (params.pageSize) {
    searchParams.set("pageSize", params.pageSize.toString());
  }

  const url = `/api/ideas${searchParams.toString() ? `?${searchParams}` : ""}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Failed to fetch ideas");
  }

  return res.json();
}

export function useIdeas(params: UseIdeasParams = {}) {
  return useQuery({
    queryKey: ["ideas", params],
    queryFn: () => fetchIdeas(params),
  });
}

// Compute total pool value from ideas
export function useTotalPoolValue() {
  const { data } = useIdeas({ pageSize: 100 });

  if (!data?.data) return 0;

  return data.data.reduce((sum, idea) => sum + idea.pool, 0);
}
