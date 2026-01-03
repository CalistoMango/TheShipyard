import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { validateAuth, validateFidMatch } from "~/lib/auth";
import { ensureUserExists } from "~/lib/user";
import { hasVotingEnded } from "~/lib/time";

interface VoteRequest {
  voter_fid: number;
  approved: boolean;
}

// POST /api/builds/[id]/vote - Cast a vote on a build
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: buildId } = await params;

  try {
    // Validate authentication
    const auth = await validateAuth(request);
    if (!auth.authenticated || !auth.fid) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as VoteRequest;

    if (!body.voter_fid || typeof body.approved !== "boolean") {
      return NextResponse.json(
        { error: "Missing required fields: voter_fid, approved" },
        { status: 400 }
      );
    }

    // Verify authenticated user matches requested voter FID
    const fidError = validateFidMatch(auth.fid, body.voter_fid);
    if (fidError) {
      return NextResponse.json({ error: fidError }, { status: 403 });
    }

    const supabase = createServerClient();

    // Verify build exists and is in voting status
    const { data: build, error: buildError } = await supabase
      .from("builds")
      .select("id, status, vote_ends_at, votes_approve, votes_reject, builder_fid")
      .eq("id", buildId)
      .single();

    if (buildError || !build) {
      return NextResponse.json({ error: "Build not found" }, { status: 404 });
    }

    if (build.status !== "voting") {
      return NextResponse.json(
        { error: "Voting is not open for this build" },
        { status: 400 }
      );
    }

    // Check if voting window has ended
    if (hasVotingEnded(build.vote_ends_at)) {
      return NextResponse.json(
        { error: "Voting period has ended" },
        { status: 400 }
      );
    }

    // Builder cannot vote on their own build
    if (body.voter_fid === build.builder_fid) {
      return NextResponse.json(
        { error: "Builders cannot vote on their own builds" },
        { status: 400 }
      );
    }

    // Ensure voter user exists with profile info
    await ensureUserExists(body.voter_fid);

    // Check if user already voted
    const { data: existingVote } = await supabase
      .from("votes")
      .select("id, approved")
      .eq("build_id", buildId)
      .eq("voter_fid", body.voter_fid)
      .single();

    if (existingVote) {
      // User already voted - votes are locked, no changes allowed
      return NextResponse.json(
        { error: "You have already voted on this build" },
        { status: 400 }
      );
    }

    // Create new vote
    const { error: voteError } = await supabase.from("votes").insert({
      build_id: buildId,
      voter_fid: body.voter_fid,
      approved: body.approved,
    });

    if (voteError) {
      console.error("Error creating vote:", voteError);
      return NextResponse.json(
        { error: "Failed to record vote" },
        { status: 500 }
      );
    }

    // ATOMIC: Sync vote counts with actual table counts
    const { data: counts } = await supabase
      .rpc("sync_vote_counts", { build_id_param: buildId });

    return NextResponse.json({
      status: "voted",
      approved: body.approved,
      votes_approve: counts?.votes_approve ?? 0,
      votes_reject: counts?.votes_reject ?? 0,
    });
  } catch (error) {
    console.error("Vote error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/builds/[id]/vote?voter_fid=X - Check if user has voted
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: buildId } = await params;
  const { searchParams } = new URL(request.url);
  const voterFid = searchParams.get("voter_fid");

  if (!voterFid) {
    return NextResponse.json(
      { error: "Missing query param: voter_fid" },
      { status: 400 }
    );
  }

  try {
    const supabase = createServerClient();

    const { data: vote } = await supabase
      .from("votes")
      .select("approved")
      .eq("build_id", buildId)
      .eq("voter_fid", parseInt(voterFid, 10))
      .single();

    return NextResponse.json({
      has_voted: !!vote,
      approved: vote?.approved ?? null,
    });
  } catch (error) {
    console.error("Check vote error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
