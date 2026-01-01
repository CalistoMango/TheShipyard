import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { fetchUserInfo } from "~/lib/neynar";
import { validateAuth, validateFidMatch } from "~/lib/auth";
import { verifyFundingTransaction } from "~/lib/vault-signer";

interface FundRequest {
  user_fid: number;
  amount: number;
  tx_hash?: string; // On-chain transaction hash
}

// Minimum funding amount from rules
const MIN_FUNDING_AMOUNT = 1;

// Race mode threshold (configurable via env)
const RACE_MODE_THRESHOLD = Number(process.env.RACE_MODE_THRESHOLD) || 100;

// POST /api/ideas/[id]/fund - Fund an idea
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ideaId = parseInt(id, 10);

  if (isNaN(ideaId)) {
    return NextResponse.json({ error: "Invalid idea ID" }, { status: 400 });
  }

  try {
    // Validate authentication
    const auth = await validateAuth(request);
    if (!auth.authenticated || !auth.fid) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as FundRequest;

    if (!body.user_fid) {
      return NextResponse.json(
        { error: "Missing required field: user_fid" },
        { status: 400 }
      );
    }

    // Verify authenticated user matches requested FID
    const fidError = validateFidMatch(auth.fid, body.user_fid);
    if (fidError) {
      return NextResponse.json({ error: fidError }, { status: 403 });
    }

    if (!body.amount || body.amount < MIN_FUNDING_AMOUNT) {
      return NextResponse.json(
        { error: `Minimum funding amount is $${MIN_FUNDING_AMOUNT}` },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Verify idea exists and is open
    const { data: idea, error: ideaError } = await supabase
      .from("ideas")
      .select("id, status, pool")
      .eq("id", ideaId)
      .single();

    if (ideaError || !idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    if (idea.status !== "open") {
      return NextResponse.json(
        { error: "Can only fund ideas with 'open' status" },
        { status: 400 }
      );
    }

    // Ensure user exists with profile info
    const { data: existingUser } = await supabase
      .from("users")
      .select("fid, username")
      .eq("fid", body.user_fid)
      .single();

    if (!existingUser) {
      // Fetch user info from Neynar before creating
      const userInfo = await fetchUserInfo(body.user_fid);
      await supabase.from("users").insert({
        fid: body.user_fid,
        username: userInfo?.username || null,
        display_name: userInfo?.display_name || null,
        pfp_url: userInfo?.pfp_url || null,
      });
    } else if (!existingUser.username) {
      // Update user if username is missing
      const userInfo = await fetchUserInfo(body.user_fid);
      if (userInfo?.username) {
        await supabase
          .from("users")
          .update({
            username: userInfo.username,
            display_name: userInfo.display_name,
            pfp_url: userInfo.pfp_url,
          })
          .eq("fid", body.user_fid);
      }
    }

    // SECURITY: Verify on-chain transaction if tx_hash is provided
    // This prevents forged funding amounts
    let verifiedAmount = body.amount;
    if (body.tx_hash) {
      // CRITICAL: Check for tx_hash replay - prevent same tx from being used twice
      const { data: existingFunding } = await supabase
        .from("funding")
        .select("id")
        .eq("tx_hash", body.tx_hash)
        .single();

      if (existingFunding) {
        return NextResponse.json(
          { error: "Transaction has already been recorded" },
          { status: 409 }
        );
      }

      const verification = await verifyFundingTransaction(
        body.tx_hash,
        body.user_fid,
        ideaId
      );

      if (!verification.verified) {
        return NextResponse.json(
          { error: verification.error || "Transaction verification failed" },
          { status: 400 }
        );
      }

      // Use the on-chain verified amount (in USDC base units -> convert to USDC)
      if (verification.amount > 0n) {
        verifiedAmount = Number(verification.amount) / 1_000_000;
        console.log(`Verified funding: client=${body.amount}, on-chain=${verifiedAmount}`);
      }
    } else {
      // No tx_hash - this is a legacy flow or testing, require VAULT_ADDRESS not set
      if (process.env.VAULT_ADDRESS) {
        return NextResponse.json(
          { error: "tx_hash is required for on-chain funding" },
          { status: 400 }
        );
      }
    }

    // Create funding record with VERIFIED amount
    const { data: fundingRecord, error: fundingError } = await supabase
      .from("funding")
      .insert({
        idea_id: ideaId,
        funder_fid: body.user_fid,
        amount: verifiedAmount, // Use verified amount, not client-provided
        tx_hash: body.tx_hash || null,
      })
      .select("id, amount, created_at")
      .single();

    if (fundingError) {
      // Handle unique constraint violation (race condition on tx_hash)
      if (fundingError.code === "23505") {
        return NextResponse.json(
          { error: "Transaction has already been recorded" },
          { status: 409 }
        );
      }
      console.error("Error creating funding record:", fundingError);
      return NextResponse.json(
        { error: "Failed to create funding record" },
        { status: 500 }
      );
    }

    // ATOMIC: Use RPC to increment pool (prevents race conditions)
    const { data: newPoolTotal, error: poolError } = await supabase
      .rpc("increment_pool", { idea_id_param: ideaId, amount_param: verifiedAmount });

    if (poolError) {
      console.error("Error updating pool:", poolError);
      // Note: funding record is immutable, so we can't rollback
      // In production, this should trigger an alert for manual reconciliation
    }

    const poolValue = Number(newPoolTotal) || Number(idea.pool) + verifiedAmount;

    // Check if race mode should be triggered
    const wasUnderThreshold = Number(idea.pool) < RACE_MODE_THRESHOLD;
    const isNowOverThreshold = poolValue >= RACE_MODE_THRESHOLD;
    const triggersRaceMode = wasUnderThreshold && isNowOverThreshold;

    // Update status if race mode triggered
    if (triggersRaceMode) {
      await supabase
        .from("ideas")
        .update({ status: "voting" })
        .eq("id", ideaId);
    }

    return NextResponse.json({
      status: "funded",
      funding_id: fundingRecord.id,
      amount: verifiedAmount, // Return verified amount
      new_pool_total: poolValue,
      race_mode_triggered: triggersRaceMode,
    });
  } catch (error) {
    console.error("Funding error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/ideas/[id]/fund - Get funding history for an idea
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ideaId = parseInt(id, 10);

  if (isNaN(ideaId)) {
    return NextResponse.json({ error: "Invalid idea ID" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();

    // Verify idea exists
    const { data: idea, error: ideaError } = await supabase
      .from("ideas")
      .select("id, pool")
      .eq("id", ideaId)
      .single();

    if (ideaError || !idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    // Get funding history with user info (only non-refunded funding)
    const { data: funding, error: fundingError } = await supabase
      .from("funding")
      .select(
        `
        id,
        amount,
        created_at,
        funder_fid,
        refunded_at,
        users:funder_fid (
          username,
          display_name
        )
      `
      )
      .eq("idea_id", ideaId)
      .is("refunded_at", null) // Only show non-refunded funding
      .order("created_at", { ascending: false });

    if (fundingError) {
      console.error("Error fetching funding:", fundingError);
      return NextResponse.json(
        { error: "Failed to fetch funding history" },
        { status: 500 }
      );
    }

    // Transform to FundingEntry format
    const fundingHistory = funding.map((f) => {
      const user = (f.users as unknown as { username: string | null; display_name: string | null }[] | null)?.[0] ?? null;
      return {
        user: user?.display_name || user?.username || `fid:${f.funder_fid}`,
        user_fid: f.funder_fid,
        amount: Number(f.amount),
        created_at: f.created_at,
      };
    });

    // Get unique funders count
    const uniqueFunders = new Set(funding.map((f) => f.funder_fid)).size;

    return NextResponse.json({
      data: {
        pool: Number(idea.pool),
        total_funders: uniqueFunders,
        funding_history: fundingHistory,
      },
    });
  } catch (error) {
    console.error("Get funding error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
