import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { getAdminFids } from "~/lib/admin";
import { sendPushNotification } from "~/lib/notifications";
import { fetchUserInfo } from "~/lib/neynar";

interface ReportRequest {
  url: string;
  note?: string;
  reporter_fid: number;
}

// POST /api/ideas/[id]/report - Submit "Already Built" report
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ideaId = parseInt(id, 10);

    if (isNaN(ideaId)) {
      return NextResponse.json(
        { data: null, error: "Invalid idea ID" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as ReportRequest;

    // Validate required fields
    if (!body.url || !body.reporter_fid) {
      return NextResponse.json(
        { data: null, error: "url and reporter_fid are required" },
        { status: 400 }
      );
    }

    // Basic URL validation
    try {
      new URL(body.url);
    } catch {
      return NextResponse.json(
        { data: null, error: "Invalid URL format" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Check if idea exists
    const { data: idea, error: ideaError } = await supabase
      .from("ideas")
      .select("id, status, title")
      .eq("id", ideaId)
      .single();

    if (ideaError || !idea) {
      return NextResponse.json(
        { data: null, error: "Idea not found" },
        { status: 404 }
      );
    }

    // Check if idea is already completed
    if (idea.status === "completed") {
      return NextResponse.json(
        { data: null, error: "Idea is already marked as completed" },
        { status: 400 }
      );
    }

    // Ensure reporter user exists with profile info
    const { data: existingUser } = await supabase
      .from("users")
      .select("fid, username")
      .eq("fid", body.reporter_fid)
      .single();

    if (!existingUser) {
      const userInfo = await fetchUserInfo(body.reporter_fid);
      await supabase.from("users").insert({
        fid: body.reporter_fid,
        username: userInfo?.username || null,
        display_name: userInfo?.display_name || null,
        pfp_url: userInfo?.pfp_url || null,
      });
    } else if (!existingUser.username) {
      const userInfo = await fetchUserInfo(body.reporter_fid);
      if (userInfo?.username) {
        await supabase
          .from("users")
          .update({
            username: userInfo.username,
            display_name: userInfo.display_name,
            pfp_url: userInfo.pfp_url,
          })
          .eq("fid", body.reporter_fid);
      }
    }

    // Check for duplicate report from same user for same idea
    const { data: existingReport } = await supabase
      .from("reports")
      .select("id")
      .eq("idea_id", ideaId)
      .eq("reporter_fid", body.reporter_fid)
      .single();

    if (existingReport) {
      return NextResponse.json(
        { data: null, error: "You have already submitted a report for this idea" },
        { status: 400 }
      );
    }

    // Create report
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .insert({
        idea_id: ideaId,
        reporter_fid: body.reporter_fid,
        url: body.url,
        note: body.note || null,
        status: "pending",
      })
      .select("id")
      .single();

    if (reportError) {
      console.error("Error creating report:", reportError);
      return NextResponse.json(
        { data: null, error: "Failed to create report" },
        { status: 500 }
      );
    }

    // Notify admins about new report
    const adminFids = getAdminFids();
    for (const adminFid of adminFids) {
      sendPushNotification(
        adminFid,
        "New Solution Report 📋",
        `Someone reported an existing solution for "${idea.title}". Review it now.`
      ).catch((err) => console.error("Failed to notify admin:", err));
    }

    return NextResponse.json({
      data: { id: report.id },
      error: null,
    });
  } catch (err) {
    console.error("Report error:", err);
    return NextResponse.json(
      { data: null, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/ideas/[id]/report - Get reports for an idea (for display)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ideaId = parseInt(id, 10);

    if (isNaN(ideaId)) {
      return NextResponse.json(
        { data: null, error: "Invalid idea ID" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { data: reports, error } = await supabase
      .from("reports")
      .select("id, url, note, status, created_at, reporter_fid, users!reporter_fid(username, display_name)")
      .eq("idea_id", ideaId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching reports:", error);
      return NextResponse.json(
        { data: null, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: reports || [],
      error: null,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { data: null, error: "Internal server error" },
      { status: 500 }
    );
  }
}
