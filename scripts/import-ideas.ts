import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { NeynarAPIClient, Configuration } from "@neynar/nodejs-sdk";
import * as fs from "fs";
import * as path from "path";

// Load .env.local
config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;
const neynarApiKey = process.env.NEYNAR_API_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase credentials in .env.local");
  process.exit(1);
}

if (!neynarApiKey) {
  console.error("❌ Missing NEYNAR_API_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const neynarConfig = new Configuration({ apiKey: neynarApiKey });
const neynar = new NeynarAPIClient(neynarConfig);

// Types for the JSON structure
interface IdeaJson {
  id: number;
  title: string;
  description: string;
  category: string;
  is_mini_app: boolean;
  submitters: string[];
  duplicate_count: number;
  original_texts: string[];
  original_urls: string[];
}

interface IdeasBatch {
  summary: {
    total_raw_ideas: number;
    after_dedup: number;
    mini_app_ideas: number;
    by_category: Record<string, number>;
  };
  ideas: IdeaJson[];
}

// Resolved user info
interface ResolvedUser {
  fid: number;
  username: string;
  display_name: string | null;
  pfp_url: string | null;
}

async function clearDatabase() {
  console.log("🗑️  Clearing existing data...\n");

  // Clear in reverse dependency order
  const tables = [
    "payouts",
    "votes",
    "builds",
    "upvotes",
    "funding",
    "ideas",
    "withdrawals",
    "deposits",
    "users",
  ];

  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .neq(table === "ideas" ? "id" : table === "users" ? "fid" : "id", table === "ideas" ? 0 : table === "users" ? 0 : "00000000-0000-0000-0000-000000000000");

    if (error) {
      console.error(`  ⚠️  Error clearing ${table}:`, error.message);
    } else {
      console.log(`  ✓ Cleared ${table}`);
    }
  }
  console.log("");
}

async function resolveUsername(username: string): Promise<ResolvedUser | null> {
  try {
    // Remove .eth suffix variations for lookup if needed
    const lookupName = username.replace(/\.eth$/, "");

    const response = await neynar.lookupUserByUsername({ username: lookupName });

    if (response.user) {
      return {
        fid: response.user.fid,
        username: response.user.username,
        display_name: response.user.display_name || null,
        pfp_url: response.user.pfp_url || null,
      };
    }
    return null;
  } catch (error) {
    // Try with original username if first attempt failed
    if (username !== username.replace(/\.eth$/, "")) {
      try {
        const response = await neynar.lookupUserByUsername({ username });
        if (response.user) {
          return {
            fid: response.user.fid,
            username: response.user.username,
            display_name: response.user.display_name || null,
            pfp_url: response.user.pfp_url || null,
          };
        }
      } catch {
        // Fall through to return null
      }
    }
    return null;
  }
}

async function resolveAllUsernames(usernames: string[]): Promise<Map<string, ResolvedUser>> {
  console.log(`🔍 Resolving ${usernames.length} unique usernames via Neynar...\n`);

  const resolved = new Map<string, ResolvedUser>();
  const failed: string[] = [];

  for (let i = 0; i < usernames.length; i++) {
    const username = usernames[i];
    process.stdout.write(`  [${i + 1}/${usernames.length}] ${username}... `);

    const user = await resolveUsername(username);

    if (user) {
      resolved.set(username, user);
      console.log(`✓ fid:${user.fid}`);
    } else {
      failed.push(username);
      console.log(`✗ not found`);
    }

    // Small delay to avoid rate limiting
    if (i < usernames.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`\n  ✅ Resolved: ${resolved.size}/${usernames.length}`);
  if (failed.length > 0) {
    console.log(`  ⚠️  Failed: ${failed.join(", ")}`);
  }
  console.log("");

  return resolved;
}

async function createUsers(users: ResolvedUser[]) {
  console.log(`👤 Creating ${users.length} users in database...\n`);

  let created = 0;
  let errors = 0;

  for (const user of users) {
    const { error } = await supabase.from("users").upsert({
      fid: user.fid,
      username: user.username,
      display_name: user.display_name || user.username,
      pfp_url: user.pfp_url,
      balance: 0,
      streak: 0,
    }, { onConflict: "fid" });

    if (error) {
      console.error(`  ⚠️  Error creating user ${user.username}:`, error.message);
      errors++;
    } else {
      created++;
    }
  }

  console.log(`  ✅ Created: ${created}, Errors: ${errors}\n`);
}

async function importIdeas(ideas: IdeaJson[], usernameMap: Map<string, ResolvedUser>) {
  console.log(`💡 Importing ${ideas.length} ideas...\n`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const idea of ideas) {
    // Get submitter FID from first submitter
    const firstSubmitter = idea.submitters[0];
    const submitterUser = firstSubmitter ? usernameMap.get(firstSubmitter) : null;
    const submitterFid = submitterUser?.fid || null;

    // Check for duplicate by title
    const { data: existing } = await supabase
      .from("ideas")
      .select("id")
      .eq("title", idea.title)
      .single();

    if (existing) {
      console.log(`  ⏭️  Skipped (duplicate): "${idea.title.slice(0, 40)}..."`);
      skipped++;
      continue;
    }

    const { error } = await supabase.from("ideas").insert({
      title: idea.title,
      description: idea.description,
      category: idea.category,
      status: "open",
      submitter_fid: submitterFid,
      pool: 0,
      upvote_count: 0,
      cast_hash: null,
      related_casts: [],
    });

    if (error) {
      console.error(`  ❌ Error importing "${idea.title.slice(0, 30)}...":`, error.message);
      errors++;
    } else {
      const submitterInfo = submitterFid ? `by fid:${submitterFid}` : "(no submitter)";
      console.log(`  ✓ ${idea.title.slice(0, 50)} ${submitterInfo}`);
      created++;
    }
  }

  console.log(`\n  ✅ Created: ${created}, Skipped: ${skipped}, Errors: ${errors}\n`);
}

async function verify() {
  console.log("📊 Verifying import...\n");

  const { count: userCount } = await supabase.from("users").select("*", { count: "exact", head: true });
  const { count: ideaCount } = await supabase.from("ideas").select("*", { count: "exact", head: true });

  const { data: categoryBreakdown } = await supabase
    .from("ideas")
    .select("category");

  const categories: Record<string, number> = {};
  categoryBreakdown?.forEach(row => {
    categories[row.category] = (categories[row.category] || 0) + 1;
  });

  console.log("  Summary:");
  console.log(`    Users: ${userCount}`);
  console.log(`    Ideas: ${ideaCount}`);
  console.log(`    By category:`);
  Object.entries(categories).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
    console.log(`      - ${cat}: ${count}`);
  });
}

async function main() {
  console.log("========================================");
  console.log("🚀 The Shipyard - Bulk Idea Import");
  console.log("========================================\n");

  // Load JSON file
  const jsonPath = path.join(process.cwd(), "TEMP_ideas-batch1.json");

  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ File not found: ${jsonPath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(jsonPath, "utf-8");
  const data: IdeasBatch = JSON.parse(rawData);

  console.log(`📄 Loaded ${data.ideas.length} ideas from JSON\n`);
  console.log("  Summary from file:");
  console.log(`    Total raw: ${data.summary.total_raw_ideas}`);
  console.log(`    After dedup: ${data.summary.after_dedup}`);
  console.log(`    Categories: ${Object.entries(data.summary.by_category).map(([k, v]) => `${k}(${v})`).join(", ")}`);
  console.log("");

  // Step 1: Clear existing data
  await clearDatabase();

  // Step 2: Extract unique submitters
  const allSubmitters = new Set<string>();
  data.ideas.forEach(idea => {
    idea.submitters.forEach(s => allSubmitters.add(s));
  });
  const uniqueSubmitters = Array.from(allSubmitters);
  console.log(`📋 Found ${uniqueSubmitters.length} unique submitters\n`);

  // Step 3: Resolve usernames to FIDs via Neynar
  const usernameMap = await resolveAllUsernames(uniqueSubmitters);

  // Step 4: Create users in database
  const users = Array.from(usernameMap.values());
  if (users.length > 0) {
    await createUsers(users);
  }

  // Step 5: Import ideas
  await importIdeas(data.ideas, usernameMap);

  // Step 6: Verify
  await verify();

  console.log("\n========================================");
  console.log("✅ Import complete!");
  console.log("========================================\n");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
