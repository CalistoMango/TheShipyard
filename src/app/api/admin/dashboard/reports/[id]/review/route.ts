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
      // Atomically update idea to already_exists only if not completed
      // This prevents race conditions with concurrent build approvals
      const { data: updatedIdea, error: updateIdeaError } = await supabase
        .from("ideas")
        .update({
          status: "already_exists",
          solution_url: report.url,
        })
        .eq("id", report.idea_id)
        .neq("status", "completed")
        .select("id")
        .maybeSingle();

      if (updateIdeaError) {
        console.error("Error updating idea:", updateIdeaError);
        return NextResponse.json(
          { error: "Failed to update idea" },
          { status: 500 }
        );
      }

      // If no row was updated, idea was already completed - dismiss the report
      if (!updatedIdea) {
        const { error: dismissError } = await supabase
          .from("reports")
          .update({
            status: "dismissed",
            reviewed_at: now,
          })
          .eq("id", reportId);

        if (dismissError) {
          console.error("Error dismissing report:", dismissError);
          return NextResponse.json(
            { error: "Failed to dismiss report - idea was already completed" },
            { status: 500 }
          );
        }

        return NextResponse.json(
          { error: "Cannot approve - idea was already completed by an approved build. Report has been dismissed." },
          { status: 400 }
        );
      }

      // Update report status with retry logic to avoid inconsistent state
      let reportUpdateSuccess = false;
      let lastReportError: unknown = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        const { error: updateReportError } = await supabase
          .from("reports")
          .update({
            status: "approved",
            reviewed_at: now,
          })
          .eq("id", reportId);

        if (!updateReportError) {
          reportUpdateSuccess = true;
          break;
        }
        lastReportError = updateReportError;
        // Brief delay before retry
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
      }

      if (!reportUpdateSuccess) {
        console.error("Error updating report after retries:", lastReportError);
        // Idea was already updated - return partial success so admin knows to check
        return NextResponse.json(
          {
            error: "Idea marked as already_exists but report status update failed. Please manually verify report status.",
            partial_success: true,
            idea_id: report.idea_id,
            idea_status: "already_exists",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        status: "approved",
        report_id: reportId,
        idea_id: report.idea_id,
        idea_status: "already_exists",
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
