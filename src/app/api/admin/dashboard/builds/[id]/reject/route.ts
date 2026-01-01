import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { validateAuth, isAdminFid } from "~/lib/auth";

// POST /api/admin/dashboard/builds/[id]/reject - Reject a build
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: buildId } = await params;

  try {
    // Validate admin authentication via JWT
    const auth = await validateAuth(request);
    if (!auth.authenticated || !auth.fid) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
    }
    if (!isAdminFid(auth.fid)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const supabase = createServerClient();

    // Verify build exists and is pending
    const { data: build, error: buildError } = await supabase
      .from("builds")
      .select("id, status")
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

    const { error: updateError } = await supabase
      .from("builds")
      .update({ status: "rejected" })
      .eq("id", buildId);

    if (updateError) {
      console.error("Error rejecting build:", updateError);
      return NextResponse.json(
        { error: "Failed to reject build" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "rejected",
      build_id: buildId,
    });
  } catch (err) {
    console.error("Reject build error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
