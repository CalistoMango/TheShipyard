import type { Idea, Comment, Builder, FundingEntry, IdeaSubmitter, RecentBuild } from "./types";

export const ideas: Idea[] = [
  {
    id: 1,
    title: "Farcaster Wordle Clone",
    category: "games",
    pool: 250,
    upvotes: 47,
    submitter: "dwr.eth",
    status: "open",
    description: "Daily word game like Wordle but with crypto/FC themed words. Leaderboards, streaks, share results as casts.",
  },
  {
    id: 2,
    title: "Channel Analytics Dashboard",
    category: "tools",
    pool: 180,
    upvotes: 32,
    submitter: "vitalik.eth",
    status: "open",
    description: "See engagement metrics for any FC channel - top casters, growth trends, peak activity times.",
  },
  {
    id: 3,
    title: "NFT Portfolio Tracker Frame",
    category: "defi",
    pool: 420,
    upvotes: 89,
    submitter: "jesse.base.eth",
    status: "voting",
    description: "Quick view of your NFT holdings across chains. Floor prices, rarity, recent sales.",
  },
  {
    id: 4,
    title: "Collaborative Playlist Builder",
    category: "social",
    pool: 75,
    upvotes: 21,
    submitter: "music.eth",
    status: "open",
    description: "Create playlists with friends on FC. Vote on tracks, share listening sessions.",
  },
  {
    id: 5,
    title: "Meme Generator Frame",
    category: "content",
    pool: 150,
    upvotes: 56,
    submitter: "degen.eth",
    status: "open",
    description: "Create memes directly in Farcaster. Templates, custom text, instant sharing.",
  },
  {
    id: 6,
    title: "Tip Splitter for Collabs",
    category: "tools",
    pool: 95,
    upvotes: 18,
    submitter: "builder.eth",
    status: "open",
    description: "Split DEGEN tips automatically between collaborators on a cast or project.",
  },
];

export const categories = ["all", "games", "tools", "social", "defi", "content", "other"] as const;

export const comments: Comment[] = [
  { user: "alice.eth", text: "Would love this! Been waiting for something like it.", time: "2h ago" },
  { user: "bob.eth", text: "Should integrate with existing leaderboard systems", time: "4h ago" },
  { user: "carol.eth", text: "I might build this 👀", time: "6h ago" },
];

export const builders: Builder[] = [
  { name: "speedbuilder.eth", claimed: 12, earned: 2450, streak: 3 },
  { name: "shipper.eth", claimed: 8, earned: 1820, streak: 0 },
  { name: "maker.eth", claimed: 6, earned: 980, streak: 2 },
];

export const fundingHistory: FundingEntry[] = [
  { user: "whale.eth", amount: 100 },
  { user: "degen.eth", amount: 50 },
  { user: "builder.eth", amount: 25 },
];

export const topIdeaSubmitters: IdeaSubmitter[] = [
  { name: "ideaguy.eth", ideas: 8, earnings: 420 },
  { name: "thinker.eth", ideas: 5, earnings: 280 },
  { name: "creator.eth", ideas: 4, earnings: 150 },
];

export const recentBuilds: RecentBuild[] = [
  { title: "FC Polls Frame", earned: 320, days: 2 },
  { title: "Tip Calculator", earned: 180, days: 5 },
  { title: "Channel Leaderboard", earned: 450, days: 12 },
];

export const totalPoolValue = ideas.reduce((sum, idea) => sum + idea.pool, 0);
