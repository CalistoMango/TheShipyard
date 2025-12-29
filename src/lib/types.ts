export type IdeaStatus = "open" | "voting" | "completed";

export type Category = "games" | "tools" | "social" | "defi" | "content" | "other";

export interface Idea {
  id: number;
  title: string;
  description: string;
  category: Category;
  pool: number;
  upvotes: number;
  submitter: string;
  status: IdeaStatus;
}

export interface Comment {
  user: string;
  text: string;
  time: string;
}

export interface Builder {
  name: string;
  claimed: number;
  earned: number;
  streak: number;
}

export interface FundingEntry {
  user: string;
  amount: number;
}

export interface IdeaSubmitter {
  name: string;
  ideas: number;
  earnings: number;
}

export interface RecentBuild {
  title: string;
  earned: number;
  days: number;
}
