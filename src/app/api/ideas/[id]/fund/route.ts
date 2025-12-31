import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { fetchUserInfo } from "~/lib/neynar";

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
    const body = (await request.json()) as FundRequest;

    if (!body.user_fid) {
      return NextResponse.json(
        { error: "Missing required field: user_fid" },
        { status: 400 }
      );
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

    // On-chain funding: tx_hash is provided, no balance check needed
    // The funds were already transferred on-chain via the vault contract

    // Create funding record (immutable audit log)
    const { data: fundingRecord, error: fundingError } = await supabase
      .from("funding")
      .insert({
        idea_id: ideaId,
        funder_fid: body.user_fid,
        amount: body.amount,
      })
      .select("id, amount, created_at")
      .single();

    if (fundingError) {
      console.error("Error creating funding record:", fundingError);
      return NextResponse.json(
        { error: "Failed to create funding record" },
        { status: 500 }
      );
    }

    // Update idea pool total
    const newPoolTotal = Number(idea.pool) + body.amount;

    // Check if race mode should be triggered
    const wasUnderThreshold = Number(idea.pool) < RACE_MODE_THRESHOLD;
    const isNowOverThreshold = newPoolTotal >= RACE_MODE_THRESHOLD;
    const triggersRaceMode = wasUnderThreshold && isNowOverThreshold;

    // Update pool and potentially status
    const updateData: { pool: number; status?: string } = { pool: newPoolTotal };
    if (triggersRaceMode) {
      updateData.status = "voting"; // Race mode = voting status
    }

    const { error: poolError } = await supabase
      .from("ideas")
      .update(updateData)
      .eq("id", ideaId);

    if (poolError) {
      console.error("Error updating pool:", poolError);
      // Note: funding record is immutable, so we can't rollback
      // In production, this should trigger an alert for manual reconciliation
    }

    return NextResponse.json({
      status: "funded",
      funding_id: fundingRecord.id,
      amount: body.amount,
      new_pool_total: newPoolTotal,
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

    // Get funding history with user info
    const { data: funding, error: fundingError } = await supabase
      .from("funding")
      .select(
        `
        id,
        amount,
        created_at,
        funder_fid,
        users:funder_fid (
          username,
          display_name
        )
      `
      )
      .eq("idea_id", ideaId)
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
