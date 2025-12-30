// ===========================================
// ENUMS (matching DB)
// ===========================================

export type IdeaStatus = "open" | "voting" | "completed";
export type BuildStatus = "pending_review" | "voting" | "approved" | "rejected";
export type Category = "games" | "tools" | "social" | "defi" | "content" | "other";
export type WithdrawalStatus = "pending" | "completed" | "failed";
export type PayoutType = "builder" | "submitter" | "platform";
export type ReportStatus = "pending" | "approved" | "dismissed";

// ===========================================
// DATABASE ROW TYPES
// ===========================================

export interface DbUser {
  fid: number;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
  wallet_address: string | null;
  balance: number;
  streak: number;
  created_at: string;
  updated_at: string;
}

export interface DbDeposit {
  id: string;
  user_fid: number;
  amount: number;
  tx_hash: string;
  confirmed: boolean;
  created_at: string;
}

export interface DbWithdrawal {
  id: string;
  user_fid: number;
  amount: number;
  wallet_address: string;
  tx_hash: string | null;
  status: WithdrawalStatus;
  created_at: string;
  processed_at: string | null;
}

export interface DbIdea {
  id: number;
  title: string;
  description: string;
  category: Category;
  status: IdeaStatus;
  cast_hash: string | null;
  related_casts: string[];
  submitter_fid: number | null;
  pool: number;
  upvote_count: number;
  solution_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbFunding {
  id: string;
  idea_id: number;
  funder_fid: number;
  amount: number;
  created_at: string;
}

export interface DbUpvote {
  id: string;
  idea_id: number;
  user_fid: number;
  created_at: string;
}

export interface DbBuild {
  id: string;
  idea_id: number;
  builder_fid: number;
  url: string;
  description: string | null;
  status: BuildStatus;
  vote_ends_at: string | null;
  votes_approve: number;
  votes_reject: number;
  created_at: string;
  updated_at: string;
}

export interface DbVote {
  id: string;
  build_id: string;
  voter_fid: number;
  approved: boolean;
  created_at: string;
}

export interface DbPayout {
  id: string;
  build_id: string;
  recipient_fid: number;
  amount: number;
  payout_type: PayoutType;
  created_at: string;
}

export interface DbReport {
  id: string;
  idea_id: number;
  reporter_fid: number;
  url: string;
  note: string | null;
  status: ReportStatus;
  reviewed_at: string | null;
  created_at: string;
}

// ===========================================
// API/FRONTEND TYPES (for display)
// ===========================================

/** Idea with submitter info for display */
export interface Idea {
  id: number;
  title: string;
  description: string;
  category: Category;
  pool: number;
  upvotes: number;
  submitter: string; // username or display_name
  submitter_fid: number | null;
  status: IdeaStatus;
  cast_hash: string | null;
  related_casts: string[]; // cast hashes of duplicate suggestions
  solution_url: string | null; // URL to existing solution (from approved report)
  created_at: string;
}

/** Winning build info for completed ideas */
export interface WinningBuild {
  id: string;
  url: string;
  builder: string;
  builder_fid: number;
}

/** Funding entry for display */
export interface FundingEntry {
  user: string; // username
  user_fid: number;
  amount: number;
  created_at: string;
}

/** Builder for leaderboard */
export interface Builder {
  fid: number;
  name: string; // username or display_name
  pfp_url: string | null;
  claimed: number; // number of approved builds
  earned: number; // total earnings
  streak: number;
}

/** Idea submitter for leaderboard */
export interface IdeaSubmitter {
  fid: number;
  name: string;
  pfp_url: string | null;
  ideas: number;
  earnings: number;
}

/** Recent build for profile */
export interface RecentBuild {
  id: string;
  title: string; // idea title
  earned: number;
  days: number; // days since completion
}

/** Comment (from Farcaster, not stored) */
export interface Comment {
  user: string;
  text: string;
  time: string;
}

// ===========================================
// API RESPONSE TYPES
// ===========================================

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
