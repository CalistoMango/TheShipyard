"use client";

import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
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

// Infinite scroll version
interface UseInfiniteIdeasParams {
  category?: Category | "all";
  status?: IdeaStatus;
  sort?: SortMode;
  pageSize?: number;
}

export function useInfiniteIdeas(params: UseInfiniteIdeasParams = {}) {
  const pageSize = params.pageSize || 20;

  return useInfiniteQuery({
    queryKey: ["ideas-infinite", params],
    queryFn: ({ pageParam = 1 }) => fetchIdeas({ ...params, page: pageParam, pageSize }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const totalPages = Math.ceil(lastPage.total / lastPage.pageSize);
      if (lastPage.page < totalPages) {
        return lastPage.page + 1;
      }
      return undefined;
    },
  });
}

// Compute total pool value from ideas
export function useTotalPoolValue() {
  const { data } = useIdeas({ pageSize: 100 });

  if (!data?.data) return 0;

  return data.data.reduce((sum, idea) => sum + idea.pool, 0);
}
