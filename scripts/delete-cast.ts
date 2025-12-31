/**
 * Delete a cast posted by @theshipyard agent
 *
 * Usage: npx tsx scripts/delete-cast.ts <cast-hash>
 */

import { config } from "dotenv";
import path from "path";

// Load environment variables from .env.local
config({ path: path.resolve(process.cwd(), ".env.local") });

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const NEYNAR_AGENT_SIGNER_UUID = process.env.NEYNAR_AGENT_SIGNER_UUID;

async function deleteCast(hash: string): Promise<void> {
  if (!NEYNAR_API_KEY) {
    console.error("Error: NEYNAR_API_KEY is not set in .env.local");
    process.exit(1);
  }

  if (!NEYNAR_AGENT_SIGNER_UUID) {
    console.error("Error: NEYNAR_AGENT_SIGNER_UUID is not set in .env.local");
    process.exit(1);
  }

  console.log(`Deleting cast: ${hash}`);

  const response = await fetch("https://api.neynar.com/v2/farcaster/cast", {
    method: "DELETE",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-api-key": NEYNAR_API_KEY,
    },
    body: JSON.stringify({
      signer_uuid: NEYNAR_AGENT_SIGNER_UUID,
      target_hash: hash,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Failed to delete cast: ${error}`);
    process.exit(1);
  }

  console.log("Cast deleted successfully");
}

// Main
const hash = process.argv[2];

if (!hash) {
  console.error("Usage: npx tsx scripts/delete-cast.ts <cast-hash>");
  console.error("Example: npx tsx scripts/delete-cast.ts 0x1234abcd...");
  process.exit(1);
}

deleteCast(hash);
