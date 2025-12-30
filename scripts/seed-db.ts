import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load .env.local
config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function clearAllData() {
  console.log("🗑️  Clearing all existing data...\n");

  // Clear in reverse order of dependencies
  const tables = [
    "payouts",
    "votes",
    "builds",
    "upvotes",
    "funding",
    "reports",
    "ideas",
    "withdrawals",
    "deposits",
    "users",
  ];

  for (const table of tables) {
    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .neq(table === "ideas" ? "id" : table === "users" ? "fid" : "id",
             table === "ideas" ? 0 : table === "users" ? 0 : "00000000-0000-0000-0000-000000000000");

      if (error) {
        console.error(`  ⚠️  Error clearing ${table}:`, error.message);
      } else {
        console.log(`  ✓ Cleared ${table}`);
      }
    } catch (err) {
      console.log(`  ⚠️  Table ${table} may not exist, skipping`);
    }
  }
  console.log("");
}

async function verify() {
  console.log("📊 Verifying database state...\n");

  const { count: userCount } = await supabase.from("users").select("*", { count: "exact", head: true });
  const { count: ideaCount } = await supabase.from("ideas").select("*", { count: "exact", head: true });
  const { count: fundingCount } = await supabase.from("funding").select("*", { count: "exact", head: true });
  const { count: buildCount } = await supabase.from("builds").select("*", { count: "exact", head: true });

  console.log("  Summary:");
  console.log(`    Users: ${userCount || 0}`);
  console.log(`    Ideas: ${ideaCount || 0}`);
  console.log(`    Funding records: ${fundingCount || 0}`);
  console.log(`    Builds: ${buildCount || 0}`);
}

async function main() {
  console.log("========================================");
  console.log("🌱 The Shipyard - Database Reset");
  console.log("========================================\n");
  console.log("⚠️  This script clears all data from the database.");
  console.log("    Use import-ideas.ts to add real ideas.\n");

  await clearAllData();
  await verify();

  console.log("\n========================================");
  console.log("✅ Database cleared successfully!");
  console.log("========================================\n");
  console.log("Next steps:");
  console.log("  1. Run: npm run import:ideas");
  console.log("     to import real ideas from TEMP_ideas-batch1.json\n");
}

main().catch(console.error);
