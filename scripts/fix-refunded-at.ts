#!/usr/bin/env npx tsx
/**
 * Fix missing refunded_at timestamps for claimed refunds
 *
 * Finds funding records that have a corresponding claim tx history entry
 * but refunded_at is null, and updates them.
 *
 * V2: Now project-aware - only marks funding for the specific idea_id in the claim.
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function fixRefundedAt() {
  // Get all refund claims from tx history
  const { data: refundClaims, error: claimsError } = await supabase
    .from("used_claim_tx")
    .select("*")
    .eq("claim_type", "refund");

  if (claimsError) {
    console.error("Error fetching refund claims:", claimsError);
    return;
  }

  console.log(`Found ${refundClaims?.length || 0} refund claims in history`);

  for (const claim of refundClaims || []) {
    const hasIdeaId = claim.idea_id !== null && claim.idea_id !== undefined;
    console.log(`\nChecking claim: fid=${claim.user_fid}, idea_id=${claim.idea_id ?? "NONE"}, amount=${claim.amount}, tx=${claim.tx_hash?.slice(0, 20)}...`);

    if (!hasIdeaId) {
      console.log("  ⚠ Claim has no idea_id - skipping to avoid cross-project corruption");
      console.log("  This claim predates per-project tracking and needs manual review");
      continue;
    }

    // Get funding records for this user AND this specific idea
    const { data: funding, error: fundingError } = await supabase
      .from("funding")
      .select("*")
      .eq("funder_fid", claim.user_fid)
      .eq("idea_id", claim.idea_id)
      .is("refunded_at", null);

    if (fundingError) {
      console.error("  Error fetching funding:", fundingError);
      continue;
    }

    if (!funding || funding.length === 0) {
      console.log("  No unrefunded funding found for this idea - already fixed or no match");
      continue;
    }

    // Only mark rows that fit entirely within the claim amount (same logic as record-refund)
    let remainingToMark = claim.amount;
    const idsToUpdate: number[] = [];

    for (const f of funding) {
      const fundingAmount = Number(f.amount);
      if (fundingAmount > remainingToMark) {
        console.log(`  Skipping funding: id=${f.id}, amount=${fundingAmount} > remaining=${remainingToMark}`);
        continue;
      }
      console.log(`  Found funding: id=${f.id}, idea_id=${f.idea_id}, amount=${fundingAmount}`);
      idsToUpdate.push(f.id);
      remainingToMark -= fundingAmount;
    }

    if (idsToUpdate.length === 0) {
      console.log("  No funding IDs to update");
      continue;
    }

    if (remainingToMark > 0.01) {
      console.log(`  ⚠ Could not account for full claim: remaining=${remainingToMark.toFixed(2)} USDC`);
    }

    console.log(`  Updating ${idsToUpdate.length} funding records: ${idsToUpdate.join(", ")}`);

    // Try RPC first (if available)
    const { error: rpcError } = await supabase
      .rpc("mark_funding_refunded", { funding_ids: idsToUpdate });

    if (rpcError) {
      console.log(`  RPC not available (${rpcError.message})`);
      console.log("\n  >> Please run this SQL manually in Supabase SQL Editor:");
      const idsString = idsToUpdate.map((id) => `'${id}'`).join(",");
      console.log(`\n     UPDATE funding SET refunded_at = NOW() WHERE id IN (${idsString});\n`);
    } else {
      console.log("  Successfully updated refunded_at via RPC");
    }
  }

  console.log("\nDone!");
}

fixRefundedAt();
