import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load .env.local
config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

const EXPECTED_TABLES = [
  "users",
  "deposits",
  "withdrawals",
  "ideas",
  "funding",
  "upvotes",
  "builds",
  "votes",
  "payouts",
];

async function testConnection() {
  console.log("Testing Supabase connection...\n");

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing environment variables:");
    console.error("  NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "✓" : "✗");
    console.error("  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY:", supabaseKey ? "✓" : "✗");
    process.exit(1);
  }

  console.log("Environment variables:");
  console.log("  URL:", supabaseUrl);
  console.log("  Key:", supabaseKey.substring(0, 20) + "...\n");

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("Checking tables...\n");

  let allTablesExist = true;

  for (const table of EXPECTED_TABLES) {
    const { error } = await supabase.from(table).select("*").limit(1);

    if (error) {
      if (error.message.includes("does not exist") || error.code === "42P01") {
        console.log(`  ❌ ${table} - NOT FOUND`);
        allTablesExist = false;
      } else if (error.message.includes("permission denied") || error.code === "42501") {
        console.log(`  ⚠️  ${table} - exists but permission denied`);
      } else {
        console.log(`  ⚠️  ${table} - ${error.message}`);
      }
    } else {
      console.log(`  ✓  ${table}`);
    }
  }

  console.log("\n========================================");
  if (allTablesExist) {
    console.log("✅ All tables exist! Database is ready.");
  } else {
    console.log("⚠️  Some tables missing. Run supabase/schema.sql in Supabase SQL Editor.");
  }
  console.log("========================================\n");
}

testConnection();
