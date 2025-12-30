import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { ADMIN_API_KEY } from "~/lib/constants";
import type { ReportStatus } from "~/lib/types";

// GET /api/admin/reports - List reports for admin review
export async function GET(request: NextRequest) {
  // Check admin authentication
  const adminKey = request.headers.get("x-admin-key");
  if (adminKey !== ADMIN_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as ReportStatus | null;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20", 10), 100);

    const supabase = createServerClient();

    let query = supabase
      .from("reports")
      .select(`
        id,
        url,
        note,
        status,
        created_at,
        reviewed_at,
        reporter_fid,
        idea_id,
        users!reporter_fid(username, display_name),
        ideas!idea_id(title, status)
      `, { count: "exact" })
      .order("created_at", { ascending: false });

    // Filter by status
    if (status) {
      query = query.eq("status", status);
    }

    // Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error("Error fetching reports:", error);
      return NextResponse.json(
        { data: null, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { data: null, error: "Internal server error" },
      { status: 500 }
    );
  }
}
