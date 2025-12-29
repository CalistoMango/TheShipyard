import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load .env.local
config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

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

  try {
    // Test 1: Basic connection - query system schema
    console.log("Test 1: Checking connection...");
    const { data, error } = await supabase.from("_test_connection").select("*").limit(1);

    // We expect an error since _test_connection doesn't exist
    // But if we get a "relation does not exist" error, the connection works
    if (error) {
      if (error.message.includes("does not exist") || error.code === "42P01") {
        console.log("✓ Connection successful (table doesn't exist, but DB is reachable)\n");
      } else if (error.message.includes("permission denied") || error.code === "42501") {
        console.log("✓ Connection successful (permission denied, but DB is reachable)\n");
      } else {
        console.log("⚠ Connection issue:", error.message, "\n");
      }
    } else {
      console.log("✓ Connection successful\n");
    }

    // Test 2: Check if we can list tables (via RPC or schema inspection)
    console.log("Test 2: Checking available tables...");
    const { data: tables, error: tablesError } = await supabase.rpc("get_tables").select("*");

    if (tablesError) {
      // This is expected if the RPC doesn't exist
      console.log("  (RPC not available - tables will be created in Phase 1)\n");
    } else {
      console.log("  Tables found:", tables);
    }

    console.log("========================================");
    console.log("✅ Database connection test completed!");
    console.log("========================================\n");
    console.log("Next step: Create database tables in Supabase Dashboard or via migrations.");

  } catch (err) {
    console.error("❌ Connection failed:", err);
    process.exit(1);
  }
}

testConnection();
