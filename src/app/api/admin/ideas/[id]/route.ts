import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { verifyAdminAuth } from "~/lib/admin";

// PATCH /api/admin/ideas/[id] - Update idea (admin only)
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

  const { id } = await params;
  const ideaId = parseInt(id, 10);

  if (isNaN(ideaId)) {
    return NextResponse.json({ error: "Invalid idea ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const supabase = createServerClient();

    // Allowed fields to update
    const allowedFields = ["title", "description", "category", "status"];
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

    const { data, error } = await supabase
      .from("ideas")
      .update(updateData)
      .eq("id", ideaId)
      .select()
      .single();

    if (error) {
      console.error("Admin update idea error:", error);
      return NextResponse.json(
        { error: "Failed to update idea" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "updated",
      idea: data,
    });
  } catch (error) {
    console.error("Admin idea error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/ideas/[id] - Delete idea (admin only)
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

  const { id } = await params;
  const ideaId = parseInt(id, 10);

  if (isNaN(ideaId)) {
    return NextResponse.json({ error: "Invalid idea ID" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();

    // Check idea exists and status
    const { data: idea } = await supabase
      .from("ideas")
      .select("status, pool")
      .eq("id", ideaId)
      .single();

    if (!idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    // Prevent deletion of ideas with pools or in racing
    if (Number(idea.pool) > 0) {
      return NextResponse.json(
        { error: "Cannot delete idea with active pool. Refund first." },
        { status: 400 }
      );
    }

    if (idea.status === "racing") {
      return NextResponse.json(
        { error: "Cannot delete idea in racing status" },
        { status: 400 }
      );
    }

    // Delete related records first (upvotes)
    await supabase.from("upvotes").delete().eq("idea_id", ideaId);

    // Delete idea
    const { error } = await supabase.from("ideas").delete().eq("id", ideaId);

    if (error) {
      console.error("Admin delete idea error:", error);
      return NextResponse.json(
        { error: "Failed to delete idea" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "deleted",
      idea_id: ideaId,
    });
  } catch (error) {
    console.error("Admin delete error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
