import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";

// 48 hour voting window from rules
const VOTING_WINDOW_MS = 48 * 60 * 60 * 1000;

// POST /api/builds/[id]/approve - Admin approves build to start voting
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: buildId } = await params;

  // TODO: Add proper admin authentication
  // For now, we just check for an admin header (implement proper auth later)
  const adminKey = request.headers.get("x-admin-key");
  const expectedKey = process.env.ADMIN_API_KEY;

  if (!expectedKey || adminKey !== expectedKey) {
    return NextResponse.json(
      { error: "Unauthorized - admin access required" },
      { status: 401 }
    );
  }

  try {
    const supabase = createServerClient();

    // Verify build exists and is pending review
    const { data: build, error: buildError } = await supabase
      .from("builds")
      .select("id, status, idea_id")
      .eq("id", buildId)
      .single();

    if (buildError || !build) {
      return NextResponse.json({ error: "Build not found" }, { status: 404 });
    }

    if (build.status !== "pending_review") {
      return NextResponse.json(
        { error: `Build is not pending review. Current status: ${build.status}` },
        { status: 400 }
      );
    }

    // Set voting window
    const voteEndsAt = new Date(Date.now() + VOTING_WINDOW_MS);

    // Update build to voting status
    const { error: updateError } = await supabase
      .from("builds")
      .update({
        status: "voting",
        vote_ends_at: voteEndsAt.toISOString(),
      })
      .eq("id", buildId);

    if (updateError) {
      console.error("Error approving build:", updateError);
      return NextResponse.json(
        { error: "Failed to approve build" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "approved",
      build_id: buildId,
      voting_ends_at: voteEndsAt.toISOString(),
      message: "Build approved for voting. 48h voting window started.",
    });
  } catch (error) {
    console.error("Approve build error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
