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
        data: {
          report_id: reportId,
          action: "approved",
          idea_id: report.idea_id,
          idea_status: "completed",
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
