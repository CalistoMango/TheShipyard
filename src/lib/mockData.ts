import type { Idea, Comment, Builder, FundingEntry, IdeaSubmitter, RecentBuild } from "./types";

export const ideas: Idea[] = [
  {
    id: 1,
    title: "Farcaster Wordle Clone",
    category: "games",
    pool: 250,
    upvotes: 47,
    submitter: "dwr.eth",
    submitter_fid: 3,
    status: "open",
    description: "Daily word game like Wordle but with crypto/FC themed words. Leaderboards, streaks, share results as casts.",
    cast_hash: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 2,
    title: "Channel Analytics Dashboard",
    category: "tools",
    pool: 180,
    upvotes: 32,
    submitter: "vitalik.eth",
    submitter_fid: 5650,
    status: "open",
    description: "See engagement metrics for any FC channel - top casters, growth trends, peak activity times.",
    cast_hash: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 3,
    title: "NFT Portfolio Tracker Frame",
    category: "defi",
    pool: 420,
    upvotes: 89,
    submitter: "jesse.base.eth",
    submitter_fid: 99,
    status: "voting",
    description: "Quick view of your NFT holdings across chains. Floor prices, rarity, recent sales.",
    cast_hash: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 4,
    title: "Collaborative Playlist Builder",
    category: "social",
    pool: 75,
    upvotes: 21,
    submitter: "music.eth",
    submitter_fid: 1234,
    status: "open",
    description: "Create playlists with friends on FC. Vote on tracks, share listening sessions.",
    cast_hash: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 5,
    title: "Meme Generator Frame",
    category: "content",
    pool: 150,
    upvotes: 56,
    submitter: "degen.eth",
    submitter_fid: 5678,
    status: "open",
    description: "Create memes directly in Farcaster. Templates, custom text, instant sharing.",
    cast_hash: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 6,
    title: "Tip Splitter for Collabs",
    category: "tools",
    pool: 95,
    upvotes: 18,
    submitter: "builder.eth",
    submitter_fid: 9012,
    status: "open",
    description: "Split DEGEN tips automatically between collaborators on a cast or project.",
    cast_hash: null,
    created_at: new Date().toISOString(),
  },
];

export const categories = ["all", "games", "tools", "social", "defi", "content", "other"] as const;

export const comments: Comment[] = [
  { user: "alice.eth", text: "Would love this! Been waiting for something like it.", time: "2h ago" },
  { user: "bob.eth", text: "Should integrate with existing leaderboard systems", time: "4h ago" },
  { user: "carol.eth", text: "I might build this 👀", time: "6h ago" },
];

export const builders: Builder[] = [
  { fid: 1001, name: "speedbuilder.eth", pfp_url: null, claimed: 12, earned: 2450, streak: 3 },
  { fid: 1002, name: "shipper.eth", pfp_url: null, claimed: 8, earned: 1820, streak: 0 },
  { fid: 1003, name: "maker.eth", pfp_url: null, claimed: 6, earned: 980, streak: 2 },
];

export const fundingHistory: FundingEntry[] = [
  { user: "whale.eth", user_fid: 2001, amount: 100, created_at: new Date().toISOString() },
  { user: "degen.eth", user_fid: 2002, amount: 50, created_at: new Date().toISOString() },
  { user: "builder.eth", user_fid: 2003, amount: 25, created_at: new Date().toISOString() },
];

export const topIdeaSubmitters: IdeaSubmitter[] = [
  { fid: 3001, name: "ideaguy.eth", pfp_url: null, ideas: 8, earnings: 420 },
  { fid: 3002, name: "thinker.eth", pfp_url: null, ideas: 5, earnings: 280 },
  { fid: 3003, name: "creator.eth", pfp_url: null, ideas: 4, earnings: 150 },
];

export const recentBuilds: RecentBuild[] = [
  { id: "build-1", title: "FC Polls Frame", earned: 320, days: 2 },
  { id: "build-2", title: "Tip Calculator", earned: 180, days: 5 },
  { id: "build-3", title: "Channel Leaderboard", earned: 450, days: 12 },
];

export const totalPoolValue = ideas.reduce((sum, idea) => sum + idea.pool, 0);
