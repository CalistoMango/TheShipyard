import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { isAdminFid } from "~/lib/admin";

const VOTING_WINDOW_MS = 48 * 60 * 60 * 1000;

// POST /api/admin/dashboard/builds/[id]/approve - Approve build to start voting
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: buildId } = await params;

  try {
    const body = await request.json();
    const adminFid = body.admin_fid;

    if (!adminFid || !isAdminFid(adminFid)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const supabase = createServerClient();

    // Verify build exists and is pending
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
        { error: `Build is not pending. Status: ${build.status}` },
        { status: 400 }
      );
    }

    const voteEndsAt = new Date(Date.now() + VOTING_WINDOW_MS);

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
    });
  } catch (err) {
    console.error("Approve build error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
