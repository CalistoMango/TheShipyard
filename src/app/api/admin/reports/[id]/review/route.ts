import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { ADMIN_API_KEY } from "~/lib/constants";

interface ReviewRequest {
  action: "approve" | "dismiss";
}

// POST /api/admin/reports/[id]/review - Approve or dismiss a report
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check admin authentication
  const adminKey = request.headers.get("x-admin-key");
  if (adminKey !== ADMIN_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: reportId } = await params;
    const body = (await request.json()) as ReviewRequest;

    if (!body.action || !["approve", "dismiss"].includes(body.action)) {
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
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    if (report.status !== "pending") {
      return NextResponse.json(
        { error: "Report has already been reviewed" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    if (body.action === "approve") {
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
        data: {
          report_id: reportId,
          action: "approved",
          idea_id: report.idea_id,
          idea_status: "already_exists",
          solution_url: report.url,
        },
        error: null,
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
        console.error("Error updating report:", updateError);
        return NextResponse.json(
          { error: "Failed to update report" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        data: {
          report_id: reportId,
          action: "dismissed",
        },
        error: null,
      });
    }
  } catch (err) {
    console.error("Review error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
