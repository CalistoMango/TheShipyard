import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";

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
    const body = (await request.json()) as VoteRequest;

    if (!body.voter_fid || typeof body.approved !== "boolean") {
      return NextResponse.json(
        { error: "Missing required fields: voter_fid, approved" },
        { status: 400 }
      );
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
    if (build.vote_ends_at) {
      const endsAt = new Date(build.vote_ends_at).getTime();
      if (Date.now() > endsAt) {
        return NextResponse.json(
          { error: "Voting period has ended" },
          { status: 400 }
        );
      }
    }

    // Builder cannot vote on their own build
    if (body.voter_fid === build.builder_fid) {
      return NextResponse.json(
        { error: "Builders cannot vote on their own builds" },
        { status: 400 }
      );
    }

    // Ensure voter user exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("fid")
      .eq("fid", body.voter_fid)
      .single();

    if (!existingUser) {
      await supabase.from("users").insert({
        fid: body.voter_fid,
      });
    }

    // Check if user already voted
    const { data: existingVote } = await supabase
      .from("votes")
      .select("id, approved")
      .eq("build_id", buildId)
      .eq("voter_fid", body.voter_fid)
      .single();

    if (existingVote) {
      // User already voted - update their vote
      if (existingVote.approved === body.approved) {
        return NextResponse.json({
          status: "unchanged",
          message: "Your vote is already recorded",
          approved: body.approved,
        });
      }

      // Update vote
      await supabase
        .from("votes")
        .update({ approved: body.approved })
        .eq("id", existingVote.id);

      // Update vote counts on build
      const newApprove = body.approved
        ? build.votes_approve + 1
        : build.votes_approve - 1;
      const newReject = body.approved
        ? build.votes_reject - 1
        : build.votes_reject + 1;

      await supabase
        .from("builds")
        .update({
          votes_approve: Math.max(0, newApprove),
          votes_reject: Math.max(0, newReject),
        })
        .eq("id", buildId);

      return NextResponse.json({
        status: "updated",
        approved: body.approved,
        votes_approve: Math.max(0, newApprove),
        votes_reject: Math.max(0, newReject),
      });
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

    // Update vote counts
    const newApprove = body.approved
      ? build.votes_approve + 1
      : build.votes_approve;
    const newReject = body.approved
      ? build.votes_reject
      : build.votes_reject + 1;

    await supabase
      .from("builds")
      .update({
        votes_approve: newApprove,
        votes_reject: newReject,
      })
      .eq("id", buildId);

    return NextResponse.json({
      status: "voted",
      approved: body.approved,
      votes_approve: newApprove,
      votes_reject: newReject,
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
