import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { validateAuth, isAdminFid } from "~/lib/auth";

// POST /api/admin/dashboard/reports/[id]/review - Approve or dismiss a report
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reportId } = await params;

  try {
    // Validate admin authentication via JWT
    const auth = await validateAuth(request);
    if (!auth.authenticated || !auth.fid) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
    }
    if (!isAdminFid(auth.fid)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const action = body.action;

    if (!action || !["approve", "dismiss"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'approve' or 'dismiss'" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Fetch the report
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("id, idea_id, url, status")
      .eq("id", reportId)
      .single();

    if (reportError || !report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    if (report.status !== "pending") {
      return NextResponse.json(
        { error: "Report has already been reviewed" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    if (action === "approve") {
      // Update report status
      const { error: updateReportError } = await supabase
        .from("reports")
        .update({
          status: "approved",
          reviewed_at: now,
        })
        .eq("id", reportId);

      if (updateReportError) {
        console.error("Error updating report:", updateReportError);
        return NextResponse.json(
          { error: "Failed to update report" },
          { status: 500 }
        );
      }

      // Mark idea as completed and set solution_url
      const { error: updateIdeaError } = await supabase
        .from("ideas")
        .update({
          status: "completed",
          solution_url: report.url,
        })
        .eq("id", report.idea_id);

      if (updateIdeaError) {
        console.error("Error updating idea:", updateIdeaError);
        return NextResponse.json(
          { error: "Failed to update idea" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        status: "approved",
        report_id: reportId,
        idea_id: report.idea_id,
      });
    } else {
      // Dismiss the report
      const { error: updateError } = await supabase
        .from("reports")
        .update({
          status: "dismissed",
          reviewed_at: now,
        })
        .eq("id", reportId);

      if (updateError) {
        console.error("Error dismissing report:", updateError);
        return NextResponse.json(
          { error: "Failed to dismiss report" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        status: "dismissed",
        report_id: reportId,
      });
    }
  } catch (err) {
    console.error("Review report error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
