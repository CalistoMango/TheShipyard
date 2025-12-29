import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load .env.local
config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

// Mock users (will be created as placeholders)
const mockUsers = [
  { fid: 1, username: "dwr.eth", display_name: "Dan Romero" },
  { fid: 2, username: "vitalik.eth", display_name: "Vitalik" },
  { fid: 3, username: "jesse.base.eth", display_name: "Jesse" },
  { fid: 4, username: "music.eth", display_name: "Music Lover" },
  { fid: 5, username: "degen.eth", display_name: "Degen" },
  { fid: 6, username: "builder.eth", display_name: "Builder" },
  { fid: 7, username: "whale.eth", display_name: "Whale" },
  { fid: 8, username: "speedbuilder.eth", display_name: "Speed Builder" },
  { fid: 9, username: "shipper.eth", display_name: "Shipper" },
  { fid: 10, username: "maker.eth", display_name: "Maker" },
  { fid: 11, username: "ideaguy.eth", display_name: "Idea Guy" },
  { fid: 12, username: "thinker.eth", display_name: "Thinker" },
  { fid: 13, username: "creator.eth", display_name: "Creator" },
];

// Mock ideas from mockData.ts
const mockIdeas = [
  {
    id: 1,
    title: "Farcaster Wordle Clone",
    category: "games",
    pool: 250,
    upvote_count: 47,
    submitter_fid: 1,
    status: "open",
    description: "Daily word game like Wordle but with crypto/FC themed words. Leaderboards, streaks, share results as casts.",
  },
  {
    id: 2,
    title: "Channel Analytics Dashboard",
    category: "tools",
    pool: 180,
    upvote_count: 32,
    submitter_fid: 2,
    status: "open",
    description: "See engagement metrics for any FC channel - top casters, growth trends, peak activity times.",
  },
  {
    id: 3,
    title: "NFT Portfolio Tracker Frame",
    category: "defi",
    pool: 420,
    upvote_count: 89,
    submitter_fid: 3,
    status: "voting",
    description: "Quick view of your NFT holdings across chains. Floor prices, rarity, recent sales.",
  },
  {
    id: 4,
    title: "Collaborative Playlist Builder",
    category: "social",
    pool: 75,
    upvote_count: 21,
    submitter_fid: 4,
    status: "open",
    description: "Create playlists with friends on FC. Vote on tracks, share listening sessions.",
  },
  {
    id: 5,
    title: "Meme Generator Frame",
    category: "content",
    pool: 150,
    upvote_count: 56,
    submitter_fid: 5,
    status: "open",
    description: "Create memes directly in Farcaster. Templates, custom text, instant sharing.",
  },
  {
    id: 6,
    title: "Tip Splitter for Collabs",
    category: "tools",
    pool: 95,
    upvote_count: 18,
    submitter_fid: 6,
    status: "open",
    description: "Split DEGEN tips automatically between collaborators on a cast or project.",
  },
];

// Mock funding entries
const mockFunding = [
  { idea_id: 1, funder_fid: 7, amount: 100 },
  { idea_id: 1, funder_fid: 5, amount: 50 },
  { idea_id: 1, funder_fid: 6, amount: 100 },
  { idea_id: 2, funder_fid: 7, amount: 80 },
  { idea_id: 2, funder_fid: 1, amount: 100 },
  { idea_id: 3, funder_fid: 7, amount: 200 },
  { idea_id: 3, funder_fid: 5, amount: 120 },
  { idea_id: 3, funder_fid: 6, amount: 100 },
  { idea_id: 4, funder_fid: 4, amount: 75 },
  { idea_id: 5, funder_fid: 5, amount: 150 },
  { idea_id: 6, funder_fid: 6, amount: 95 },
];

// Mock builders with stats
const mockBuilders = [
  { fid: 8, username: "speedbuilder.eth", display_name: "Speed Builder", streak: 3, balance: 2450 },
  { fid: 9, username: "shipper.eth", display_name: "Shipper", streak: 0, balance: 1820 },
  { fid: 10, username: "maker.eth", display_name: "Maker", streak: 2, balance: 980 },
];

async function seed() {
  console.log("🌱 Seeding database...\n");

  // 1. Clear existing data (in reverse order of dependencies)
  console.log("Clearing existing data...");
  await supabase.from("payouts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("votes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("builds").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("upvotes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("funding").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("ideas").delete().neq("id", 0);
  await supabase.from("withdrawals").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("deposits").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("users").delete().neq("fid", 0);
  console.log("✓ Cleared\n");

  // 2. Insert users
  console.log("Inserting users...");
  const allUsers = [...mockUsers, ...mockBuilders.filter(b => !mockUsers.find(u => u.fid === b.fid))];

  for (const user of allUsers) {
    const builderData = mockBuilders.find(b => b.fid === user.fid);
    const { error } = await supabase.from("users").insert({
      fid: user.fid,
      username: user.username,
      display_name: user.display_name || user.username,
      balance: builderData?.balance || 0,
      streak: builderData?.streak || 0,
    });
    if (error) {
      console.error(`  Error inserting user ${user.username}:`, error.message);
    } else {
      console.log(`  ✓ ${user.username}`);
    }
  }
  console.log("");

  // 3. Insert ideas and collect their IDs
  console.log("Inserting ideas...");
  const ideaIdMap: Record<number, number> = {}; // mockId -> realId

  for (const idea of mockIdeas) {
    const { data, error } = await supabase.from("ideas").insert({
      title: idea.title,
      description: idea.description,
      category: idea.category,
      status: idea.status,
      submitter_fid: idea.submitter_fid,
      pool: idea.pool,
      upvote_count: idea.upvote_count,
    }).select("id").single();

    if (error) {
      console.error(`  Error inserting idea "${idea.title}":`, error.message);
    } else {
      ideaIdMap[idea.id] = data.id;
      console.log(`  ✓ ${idea.title} (id: ${data.id})`);
    }
  }
  console.log("");

  // 4. Insert funding
  console.log("Inserting funding...");
  for (const funding of mockFunding) {
    const realIdeaId = ideaIdMap[funding.idea_id];
    if (!realIdeaId) {
      console.error(`  Skipping funding - idea #${funding.idea_id} not found`);
      continue;
    }
    const { error } = await supabase.from("funding").insert({
      idea_id: realIdeaId,
      funder_fid: funding.funder_fid,
      amount: funding.amount,
    });
    if (error) {
      console.error(`  Error inserting funding:`, error.message);
    } else {
      console.log(`  ✓ $${funding.amount} to idea #${realIdeaId}`);
    }
  }
  console.log("");

  // 5. Add a sample build in voting for idea #3 (NFT Portfolio Tracker)
  console.log("Inserting sample build...");
  const nftTrackerIdeaId = ideaIdMap[3]; // NFT Portfolio Tracker was mock id 3
  if (nftTrackerIdeaId) {
    const voteEndsAt = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(); // 23h from now
    const { error: buildError } = await supabase
      .from("builds")
      .insert({
        idea_id: nftTrackerIdeaId,
        builder_fid: 8, // speedbuilder.eth
        url: "https://example.com/nft-tracker",
        description: "Built with Next.js and Alchemy API. Shows holdings across Ethereum, Base, and Polygon.",
        status: "voting",
        vote_ends_at: voteEndsAt,
        votes_approve: 68,
        votes_reject: 32,
      });

    if (buildError) {
      console.error("  Error inserting build:", buildError.message);
    } else {
      console.log(`  ✓ Build for "NFT Portfolio Tracker" by speedbuilder.eth`);
    }
  } else {
    console.log("  Skipping build - NFT Portfolio Tracker idea not found");
  }
  console.log("");

  console.log("========================================");
  console.log("✅ Database seeded successfully!");
  console.log("========================================\n");

  // Verify
  const { count: userCount } = await supabase.from("users").select("*", { count: "exact", head: true });
  const { count: ideaCount } = await supabase.from("ideas").select("*", { count: "exact", head: true });
  const { count: fundingCount } = await supabase.from("funding").select("*", { count: "exact", head: true });
  const { count: buildCount } = await supabase.from("builds").select("*", { count: "exact", head: true });

  console.log("Summary:");
  console.log(`  Users: ${userCount}`);
  console.log(`  Ideas: ${ideaCount}`);
  console.log(`  Funding records: ${fundingCount}`);
  console.log(`  Builds: ${buildCount}`);
}

seed().catch(console.error);
