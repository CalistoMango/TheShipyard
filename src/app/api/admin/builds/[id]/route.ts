import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { verifyAdminAuth } from "~/lib/admin";

// PATCH /api/admin/builds/[id] - Update build (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminAuth(request)) {
    return NextResponse.json(
      { error: "Unauthorized - admin access required" },
      { status: 401 }
    );
  }

  const { id: buildId } = await params;

  try {
    const body = await request.json();
    const supabase = createServerClient();

    // Allowed fields to update
    const allowedFields = ["status", "url", "description"];
    const updateData: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Validate status if provided
    if (updateData.status) {
      const validStatuses = ["pending_review", "voting", "approved", "rejected"];
      if (!validStatuses.includes(updateData.status as string)) {
        return NextResponse.json(
          { error: "Invalid status. Use: pending_review, voting, approved, rejected" },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase
      .from("builds")
      .update(updateData)
      .eq("id", buildId)
      .select()
      .single();

    if (error) {
      console.error("Admin update build error:", error);
      return NextResponse.json(
        { error: "Failed to update build" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "updated",
      build: data,
    });
  } catch (error) {
    console.error("Admin build error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/builds/[id] - Delete build (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminAuth(request)) {
    return NextResponse.json(
      { error: "Unauthorized - admin access required" },
      { status: 401 }
    );
  }

  const { id: buildId } = await params;

  try {
    const supabase = createServerClient();

    // Check build exists and status
    const { data: build } = await supabase
      .from("builds")
      .select("status")
      .eq("id", buildId)
      .single();

    if (!build) {
      return NextResponse.json({ error: "Build not found" }, { status: 404 });
    }

    // Prevent deletion of approved builds (have payouts)
    if (build.status === "approved") {
      return NextResponse.json(
        { error: "Cannot delete approved build with payouts" },
        { status: 400 }
      );
    }

    // Delete related votes first
    await supabase.from("votes").delete().eq("build_id", buildId);

    // Delete build
    const { error } = await supabase.from("builds").delete().eq("id", buildId);

    if (error) {
      console.error("Admin delete build error:", error);
      return NextResponse.json(
        { error: "Failed to delete build" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "deleted",
      build_id: buildId,
    });
  } catch (error) {
    console.error("Admin delete error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
