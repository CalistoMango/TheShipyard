import { NextRequest, NextResponse } from "next/server";
import { isAdminFid } from "~/lib/admin";

// GET /api/admin/check?fid=X - Check if a FID is an admin
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fid = parseInt(searchParams.get("fid") || "0", 10);

  if (!fid) {
    return NextResponse.json({ is_admin: false });
  }

  return NextResponse.json({ is_admin: isAdminFid(fid) });
}
