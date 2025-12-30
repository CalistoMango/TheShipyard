/**
 * Migration script to convert short cast hashes to full hashes
 *
 * The imported ideas have short hashes (e.g., 0x1720fec6) from Warpcast URLs.
 * Neynar API only works with full 40-char hashes.
 *
 * This script:
 * 1. Reads the original JSON import file to get username + short hash combos
 * 2. Queries Neynar to get the full hash for each cast
 * 3. Updates the database with full hashes where found
 *
 * Usage: npx tsx scripts/migrate-cast-hashes.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!NEYNAR_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing required environment variables:");
  console.error("- NEYNAR_API_KEY:", NEYNAR_API_KEY ? "set" : "missing");
  console.error("- NEXT_PUBLIC_SUPABASE_URL:", SUPABASE_URL ? "set" : "missing");
  console.error("- SUPABASE_SERVICE_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY:", SUPABASE_KEY ? "set" : "missing");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface ImportedIdea {
  id: number;
  title: string;
  submitters: string[];
  original_urls: string[];
}

interface ImportData {
  ideas: ImportedIdea[];
}

async function lookupFullHash(warpcastUrl: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/cast?identifier=${encodeURIComponent(warpcastUrl)}&type=url`,
      {
        headers: {
          accept: "application/json",
          api_key: NEYNAR_API_KEY!,
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.cast?.hash || null;
  } catch (error) {
    console.error(`Error looking up ${warpcastUrl}:`, error);
    return null;
  }
}

function extractShortHash(url: string): string | null {
  // Extract short hash from URL like https://warpcast.com/username/0x1720fec6
  const match = url.match(/0x[a-f0-9]+$/i);
  return match ? match[0].toLowerCase() : null;
}

async function main() {
  console.log("Starting cast hash migration...\n");

  // Load the JSON import file
  const jsonPath = path.join(process.cwd(), "TEMP_ideas-batch1.json");
  if (!fs.existsSync(jsonPath)) {
    console.error("Import file not found:", jsonPath);
    process.exit(1);
  }

  const importData: ImportData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  console.log(`Loaded ${importData.ideas.length} ideas from import file\n`);

  // Get all ideas from database with short hashes
  const { data: dbIdeas, error } = await supabase
    .from("ideas")
    .select("id, title, cast_hash")
    .not("cast_hash", "is", null);

  if (error) {
    console.error("Error fetching ideas from database:", error);
    process.exit(1);
  }

  console.log(`Found ${dbIdeas?.length || 0} ideas with cast_hash in database\n`);

  // Build a map of short hash -> import data
  const urlMap = new Map<string, string>();
  for (const idea of importData.ideas) {
    if (idea.original_urls && idea.original_urls.length > 0) {
      const url = idea.original_urls[0];
      const shortHash = extractShortHash(url);
      if (shortHash) {
        urlMap.set(shortHash, url);
      }
    }
  }

  console.log(`Built URL map with ${urlMap.size} entries\n`);

  let updated = 0;
  let notFound = 0;
  let alreadyFull = 0;
  let errors = 0;

  for (const idea of dbIdeas || []) {
    if (!idea.cast_hash) continue;

    // Skip if already a full hash (40+ chars including 0x prefix = 42 chars)
    if (idea.cast_hash.length > 20) {
      alreadyFull++;
      continue;
    }

    const shortHash = idea.cast_hash.toLowerCase();
    const warpcastUrl = urlMap.get(shortHash);

    if (!warpcastUrl) {
      console.log(`[SKIP] ID ${idea.id}: No URL found for hash ${shortHash}`);
      notFound++;
      continue;
    }

    console.log(`[LOOKUP] ID ${idea.id}: ${warpcastUrl}`);

    // Rate limit: wait 200ms between requests
    await new Promise((resolve) => setTimeout(resolve, 200));

    const fullHash = await lookupFullHash(warpcastUrl);

    if (fullHash) {
      console.log(`  -> Found full hash: ${fullHash}`);

      const { error: updateError } = await supabase
        .from("ideas")
        .update({ cast_hash: fullHash })
        .eq("id", idea.id);

      if (updateError) {
        console.error(`  -> Error updating: ${updateError.message}`);
        errors++;
      } else {
        console.log(`  -> Updated successfully`);
        updated++;
      }
    } else {
      console.log(`  -> Cast not found (may be deleted)`);
      notFound++;
    }
  }

  console.log("\n--- Migration Summary ---");
  console.log(`Already full hash: ${alreadyFull}`);
  console.log(`Updated: ${updated}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Errors: ${errors}`);
}

main().catch(console.error);
