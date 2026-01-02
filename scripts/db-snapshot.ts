#!/usr/bin/env npx tsx
/**
 * Database Snapshot & Reset Script
 *
 * Takes a snapshot of key database tables to verify transaction flows.
 * Can also reset test data before production.
 *
 * Usage:
 *   npx tsx scripts/db-snapshot.ts                       # Full snapshot
 *   npx tsx scripts/db-snapshot.ts --user 12345          # Filter by FID
 *   npx tsx scripts/db-snapshot.ts --idea 42             # Filter by idea ID
 *   npx tsx scripts/db-snapshot.ts --diff snapshot.json  # Compare with previous
 *   npx tsx scripts/db-snapshot.ts --save before.json    # Save to file
 *   npx tsx scripts/db-snapshot.ts --reset-funding        # Clear funding/tx history only (keeps ideas, users, upvotes)
 *   npx tsx scripts/db-snapshot.ts --reset               # Reset ALL test data (DESTRUCTIVE!)
 *   npx tsx scripts/db-snapshot.ts --reset-funding --confirm  # Skip confirmation prompt
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

// Load environment variables from .env.local
config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

// For read-only operations, we can use either key
// For destructive operations (--reset, --reset-funding), we require service role key
const args = process.argv.slice(2);
const isDestructive = args.includes("--reset") || args.includes("--reset-funding");
const supabaseKey = isDestructive ? serviceRoleKey : (serviceRoleKey || publishableKey);

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing environment variables:");
  console.error("  NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "✓" : "✗");
  if (isDestructive) {
    console.error("  SUPABASE_SERVICE_ROLE_KEY:", serviceRoleKey ? "✓" : "✗ (REQUIRED for destructive operations)");
  } else {
    console.error("  SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY:", supabaseKey ? "✓" : "✗");
  }
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface SnapshotOptions {
  userFid?: number;
  ideaId?: number;
  diffFile?: string;
  saveFile?: string;
  reset?: boolean;
  resetFunding?: boolean;
  confirm?: boolean;
}

interface Snapshot {
  timestamp: string;
  filters: { userFid?: number; ideaId?: number };
  users: Record<string, unknown>[];
  ideas: Record<string, unknown>[];
  funding: Record<string, unknown>[];
  used_claim_tx: Record<string, unknown>[];
  upvotes: Record<string, unknown>[];
  builds: Record<string, unknown>[];
  votes: Record<string, unknown>[];
}

async function takeSnapshot(options: SnapshotOptions): Promise<Snapshot> {
  const { userFid, ideaId } = options;

  // Users
  let usersQuery = supabase
    .from("users")
    .select("fid, username, display_name, balance, claimed_refunds, claimed_rewards, last_refund_tx_hash, last_reward_tx_hash, streak")
    .order("fid");
  if (userFid) usersQuery = usersQuery.eq("fid", userFid);

  // Ideas
  let ideasQuery = supabase
    .from("ideas")
    .select("id, title, status, pool, upvote_count, submitter_fid, builder_reward_claimed, submitter_reward_claimed, created_at, updated_at")
    .order("id");
  if (ideaId) ideasQuery = ideasQuery.eq("id", ideaId);

  // Funding
  let fundingQuery = supabase
    .from("funding")
    .select("id, idea_id, funder_fid, amount, tx_hash, refunded_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (userFid) fundingQuery = fundingQuery.eq("funder_fid", userFid);
  if (ideaId) fundingQuery = fundingQuery.eq("idea_id", ideaId);

  // Used claim transactions
  let claimTxQuery = supabase
    .from("used_claim_tx")
    .select("tx_hash, user_fid, claim_type, amount, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (userFid) claimTxQuery = claimTxQuery.eq("user_fid", userFid);

  // Upvotes
  let upvotesQuery = supabase
    .from("upvotes")
    .select("id, idea_id, user_fid, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (userFid) upvotesQuery = upvotesQuery.eq("user_fid", userFid);
  if (ideaId) upvotesQuery = upvotesQuery.eq("idea_id", ideaId);

  // Builds
  let buildsQuery = supabase
    .from("builds")
    .select("id, idea_id, builder_fid, status, votes_approve, votes_reject, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (userFid) buildsQuery = buildsQuery.eq("builder_fid", userFid);
  if (ideaId) buildsQuery = buildsQuery.eq("idea_id", ideaId);

  // Votes
  let votesQuery = supabase
    .from("votes")
    .select("id, build_id, voter_fid, approved, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (userFid) votesQuery = votesQuery.eq("voter_fid", userFid);

  const [users, ideas, funding, claimTx, upvotes, builds, votes] = await Promise.all([
    usersQuery,
    ideasQuery,
    fundingQuery,
    claimTxQuery,
    upvotesQuery,
    buildsQuery,
    votesQuery,
  ]);

  return {
    timestamp: new Date().toISOString(),
    filters: { userFid, ideaId },
    users: users.data || [],
    ideas: ideas.data || [],
    funding: funding.data || [],
    used_claim_tx: claimTx.data || [],
    upvotes: upvotes.data || [],
    builds: builds.data || [],
    votes: votes.data || [],
  };
}

function formatTable(title: string, rows: Record<string, unknown>[], keys?: string[]): string {
  if (rows.length === 0) return `\n${title}: (empty)\n`;

  const displayKeys = keys || Object.keys(rows[0]);
  const lines: string[] = [`\n${title} (${rows.length} rows):`];
  lines.push("-".repeat(80));

  for (const row of rows) {
    const values = displayKeys.map((k) => {
      const v = row[k];
      if (v === null) return "null";
      if (typeof v === "number") return Number(v).toFixed(2);
      if (typeof v === "string" && v.length > 30) return v.slice(0, 27) + "...";
      return String(v);
    });
    lines.push(`  ${displayKeys.map((k, i) => `${k}: ${values[i]}`).join(" | ")}`);
  }

  return lines.join("\n");
}

function printSnapshot(snapshot: Snapshot): void {
  console.log("=".repeat(80));
  console.log(`DATABASE SNAPSHOT - ${snapshot.timestamp}`);
  if (snapshot.filters.userFid) console.log(`  Filtered by user FID: ${snapshot.filters.userFid}`);
  if (snapshot.filters.ideaId) console.log(`  Filtered by idea ID: ${snapshot.filters.ideaId}`);
  console.log("=".repeat(80));

  console.log(formatTable("USERS", snapshot.users, ["fid", "username", "balance", "claimed_refunds", "claimed_rewards"]));
  console.log(formatTable("IDEAS", snapshot.ideas, ["id", "title", "status", "pool", "upvote_count"]));
  console.log(formatTable("FUNDING", snapshot.funding, ["idea_id", "funder_fid", "amount", "refunded_at", "tx_hash"]));
  console.log(formatTable("CLAIM TX HISTORY", snapshot.used_claim_tx, ["claim_type", "user_fid", "amount", "tx_hash"]));
  console.log(formatTable("UPVOTES", snapshot.upvotes, ["idea_id", "user_fid"]));
  console.log(formatTable("BUILDS", snapshot.builds, ["idea_id", "builder_fid", "status", "votes_approve", "votes_reject"]));
}

async function resetFundingOnly(skipConfirm: boolean): Promise<void> {
  console.log("\n" + "=".repeat(80));
  console.log("RESET FUNDING - Clear transaction data only");
  console.log("=".repeat(80));
  console.log("\nThis will:");
  console.log("  - DELETE: funding, used_claim_tx, payouts");
  console.log("  - RESET: idea pools to 0, user claimed_refunds/claimed_rewards to 0");
  console.log("  - KEEP: ideas, users, upvotes, builds, votes, reports");
  console.log("");

  if (!skipConfirm) {
    const readline = await import("readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const answer = await new Promise<string>((resolve) => {
      rl.question("Type 'RESET' to confirm: ", resolve);
    });
    rl.close();

    if (answer !== "RESET") {
      console.log("Aborted.");
      return;
    }
  }

  console.log("\nResetting funding data via RPC...");

  // Use the admin_reset_funding RPC function to bypass constraints
  const { error } = await supabase.rpc("admin_reset_funding");

  if (error) {
    console.log(`  ✗ Reset failed: ${error.message}`);
    console.log("\nMake sure the admin_reset_funding function exists in your database.");
  } else {
    console.log("  ✓ funding: deleted");
    console.log("  ✓ used_claim_tx: deleted");
    console.log("  ✓ payouts: deleted");
    console.log("  ✓ ideas: pools reset to 0");
    console.log("  ✓ users: claims reset");
    console.log("\nFunding reset complete.");
  }
}

async function resetDatabase(skipConfirm: boolean): Promise<void> {
  console.log("\n" + "=".repeat(80));
  console.log("DATABASE RESET - DESTRUCTIVE OPERATION");
  console.log("=".repeat(80));
  console.log("\nThis will DELETE all data from the following tables:");
  console.log("  - votes");
  console.log("  - builds");
  console.log("  - upvotes");
  console.log("  - funding");
  console.log("  - used_claim_tx");
  console.log("  - payouts");
  console.log("  - reports");
  console.log("  - ideas");
  console.log("  - users (reset balances and claims only, keep profiles)");
  console.log("");

  if (!skipConfirm) {
    const readline = await import("readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const answer = await new Promise<string>((resolve) => {
      rl.question("Type 'RESET' to confirm: ", resolve);
    });
    rl.close();

    if (answer !== "RESET") {
      console.log("Aborted.");
      return;
    }
  }

  console.log("\nResetting database...");

  // Delete in order respecting foreign keys
  const tables = [
    { name: "votes", query: supabase.from("votes").delete().neq("id", "00000000-0000-0000-0000-000000000000") },
    { name: "builds", query: supabase.from("builds").delete().neq("id", "00000000-0000-0000-0000-000000000000") },
    { name: "upvotes", query: supabase.from("upvotes").delete().neq("id", "00000000-0000-0000-0000-000000000000") },
    { name: "funding", query: supabase.from("funding").delete().neq("id", "00000000-0000-0000-0000-000000000000") },
    { name: "used_claim_tx", query: supabase.from("used_claim_tx").delete().neq("tx_hash", "") },
    { name: "payouts", query: supabase.from("payouts").delete().neq("id", "00000000-0000-0000-0000-000000000000") },
    { name: "reports", query: supabase.from("reports").delete().neq("id", "00000000-0000-0000-0000-000000000000") },
    { name: "ideas", query: supabase.from("ideas").delete().gt("id", 0) },
  ];

  for (const { name, query } of tables) {
    const { error, count } = await query;
    if (error) {
      console.log(`  ✗ ${name}: ${error.message}`);
    } else {
      console.log(`  ✓ ${name}: deleted`);
    }
  }

  // Reset user financial data but keep profiles
  const { error: userError } = await supabase
    .from("users")
    .update({
      balance: 0,
      claimed_refunds: 0,
      claimed_rewards: 0,
      last_refund_tx_hash: null,
      last_reward_tx_hash: null,
      streak: 0,
    })
    .gt("fid", 0);

  if (userError) {
    console.log(`  ✗ users (reset): ${userError.message}`);
  } else {
    console.log(`  ✓ users: balances and claims reset`);
  }

  console.log("\nDatabase reset complete.");
}

function compareSnapshots(before: Snapshot, after: Snapshot): void {
  console.log("\n" + "=".repeat(80));
  console.log("DIFF: Changes between snapshots");
  console.log(`  Before: ${before.timestamp}`);
  console.log(`  After:  ${after.timestamp}`);
  console.log("=".repeat(80));

  // Compare users
  const beforeUsers = new Map(before.users.map((u) => [u.fid, u]));
  const afterUsers = new Map(after.users.map((u) => [u.fid, u]));

  console.log("\nUSER CHANGES:");
  for (const [fid, afterUser] of afterUsers) {
    const beforeUser = beforeUsers.get(fid);
    if (!beforeUser) {
      console.log(`  + NEW USER: fid=${fid}`);
    } else {
      const changes: string[] = [];
      if (beforeUser.balance !== afterUser.balance) {
        changes.push(`balance: ${beforeUser.balance} → ${afterUser.balance}`);
      }
      if (beforeUser.claimed_refunds !== afterUser.claimed_refunds) {
        changes.push(`claimed_refunds: ${beforeUser.claimed_refunds} → ${afterUser.claimed_refunds}`);
      }
      if (beforeUser.claimed_rewards !== afterUser.claimed_rewards) {
        changes.push(`claimed_rewards: ${beforeUser.claimed_rewards} → ${afterUser.claimed_rewards}`);
      }
      if (changes.length > 0) {
        console.log(`  ~ fid=${fid}: ${changes.join(", ")}`);
      }
    }
  }

  // Compare ideas
  const beforeIdeas = new Map(before.ideas.map((i) => [i.id, i]));
  const afterIdeas = new Map(after.ideas.map((i) => [i.id, i]));

  console.log("\nIDEA CHANGES:");
  for (const [id, afterIdea] of afterIdeas) {
    const beforeIdea = beforeIdeas.get(id);
    if (!beforeIdea) {
      console.log(`  + NEW IDEA: id=${id} "${afterIdea.title}"`);
    } else {
      const changes: string[] = [];
      if (beforeIdea.pool !== afterIdea.pool) {
        changes.push(`pool: ${beforeIdea.pool} → ${afterIdea.pool}`);
      }
      if (beforeIdea.status !== afterIdea.status) {
        changes.push(`status: ${beforeIdea.status} → ${afterIdea.status}`);
      }
      if (beforeIdea.upvote_count !== afterIdea.upvote_count) {
        changes.push(`upvotes: ${beforeIdea.upvote_count} → ${afterIdea.upvote_count}`);
      }
      if (changes.length > 0) {
        console.log(`  ~ id=${id}: ${changes.join(", ")}`);
      }
    }
  }

  // New funding
  const beforeFundingIds = new Set(before.funding.map((f) => f.id));
  const newFunding = after.funding.filter((f) => !beforeFundingIds.has(f.id));
  if (newFunding.length > 0) {
    console.log("\nNEW FUNDING:");
    for (const f of newFunding) {
      console.log(`  + idea=${f.idea_id} funder=${f.funder_fid} amount=${f.amount}`);
    }
  }

  // Refunded funding
  const refundedFunding = after.funding.filter((f) => {
    const beforeF = before.funding.find((bf) => bf.id === f.id);
    return beforeF && !beforeF.refunded_at && f.refunded_at;
  });
  if (refundedFunding.length > 0) {
    console.log("\nREFUNDED FUNDING:");
    for (const f of refundedFunding) {
      console.log(`  - idea=${f.idea_id} funder=${f.funder_fid} amount=${f.amount}`);
    }
  }

  // New claim transactions
  const beforeClaimTx = new Set(before.used_claim_tx.map((t) => t.tx_hash));
  const newClaimTx = after.used_claim_tx.filter((t) => !beforeClaimTx.has(t.tx_hash));
  if (newClaimTx.length > 0) {
    console.log("\nNEW CLAIM TRANSACTIONS:");
    for (const t of newClaimTx) {
      console.log(`  + ${t.claim_type}: user=${t.user_fid} amount=${t.amount} tx=${t.tx_hash}`);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: SnapshotOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--user" && args[i + 1]) {
      options.userFid = parseInt(args[++i], 10);
    } else if (args[i] === "--idea" && args[i + 1]) {
      options.ideaId = parseInt(args[++i], 10);
    } else if (args[i] === "--diff" && args[i + 1]) {
      options.diffFile = args[++i];
    } else if (args[i] === "--save" && args[i + 1]) {
      options.saveFile = args[++i];
    } else if (args[i] === "--reset") {
      options.reset = true;
    } else if (args[i] === "--reset-funding") {
      options.resetFunding = true;
    } else if (args[i] === "--confirm") {
      options.confirm = true;
    }
  }

  // Handle reset modes
  if (options.resetFunding) {
    await resetFundingOnly(options.confirm || false);
    return;
  }

  if (options.reset) {
    await resetDatabase(options.confirm || false);
    return;
  }

  const snapshot = await takeSnapshot(options);

  if (options.diffFile) {
    const beforeData = fs.readFileSync(options.diffFile, "utf-8");
    const before = JSON.parse(beforeData) as Snapshot;
    compareSnapshots(before, snapshot);
  } else {
    printSnapshot(snapshot);
  }

  if (options.saveFile) {
    fs.writeFileSync(options.saveFile, JSON.stringify(snapshot, null, 2));
    console.log(`\nSnapshot saved to: ${options.saveFile}`);
  }
}

main().catch(console.error);
