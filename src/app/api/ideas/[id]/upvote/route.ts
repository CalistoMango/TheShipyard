import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";

interface UpvoteRequest {
  user_fid: number;
}

// POST /api/ideas/[id]/upvote - Toggle upvote
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ideaId = parseInt(id, 10);

  if (isNaN(ideaId)) {
    return NextResponse.json({ error: "Invalid idea ID" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as UpvoteRequest;

    if (!body.user_fid) {
      return NextResponse.json(
        { error: "Missing required field: user_fid" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Verify idea exists
    const { data: idea, error: ideaError } = await supabase
      .from("ideas")
      .select("id, status")
      .eq("id", ideaId)
      .single();

    if (ideaError || !idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    // Ensure user exists (create if not)
    const { data: existingUser } = await supabase
      .from("users")
      .select("fid")
      .eq("fid", body.user_fid)
      .single();

    if (!existingUser) {
      await supabase.from("users").insert({
        fid: body.user_fid,
      });
    }

    // Check if user already upvoted
    const { data: existingUpvote } = await supabase
      .from("upvotes")
      .select("id")
      .eq("idea_id", ideaId)
      .eq("user_fid", body.user_fid)
      .single();

    if (existingUpvote) {
      // Remove upvote (toggle off)
      await supabase.from("upvotes").delete().eq("id", existingUpvote.id);

      // Decrement upvote_count
      await supabase
        .from("ideas")
        .update({ upvote_count: idea.status === "open" ? Math.max(0, -1) : 0 })
        .eq("id", ideaId);

      // Get updated count
      const { count } = await supabase
        .from("upvotes")
        .select("*", { count: "exact", head: true })
        .eq("idea_id", ideaId);

      await supabase
        .from("ideas")
        .update({ upvote_count: count || 0 })
        .eq("id", ideaId);

      return NextResponse.json({
        status: "removed",
        upvoted: false,
        upvote_count: count || 0,
      });
    } else {
      // Add upvote (toggle on)
      const { error: insertError } = await supabase.from("upvotes").insert({
        idea_id: ideaId,
        user_fid: body.user_fid,
      });

      if (insertError) {
        console.error("Error adding upvote:", insertError);
        return NextResponse.json(
          { error: "Failed to add upvote" },
          { status: 500 }
        );
      }

      // Get updated count
      const { count } = await supabase
        .from("upvotes")
        .select("*", { count: "exact", head: true })
        .eq("idea_id", ideaId);

      await supabase
        .from("ideas")
        .update({ upvote_count: count || 0 })
        .eq("id", ideaId);

      return NextResponse.json({
        status: "added",
        upvoted: true,
        upvote_count: count || 0,
      });
    }
  } catch (error) {
    console.error("Upvote error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/ideas/[id]/upvote?user_fid=123 - Check if user has upvoted
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ideaId = parseInt(id, 10);

  if (isNaN(ideaId)) {
    return NextResponse.json({ error: "Invalid idea ID" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const userFid = searchParams.get("user_fid");

  if (!userFid) {
    return NextResponse.json(
      { error: "Missing query param: user_fid" },
      { status: 400 }
    );
  }

  const fid = parseInt(userFid, 10);
  if (isNaN(fid)) {
    return NextResponse.json({ error: "Invalid user_fid" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();

    const { data: upvote } = await supabase
      .from("upvotes")
      .select("id")
      .eq("idea_id", ideaId)
      .eq("user_fid", fid)
      .single();

    return NextResponse.json({
      upvoted: !!upvote,
    });
  } catch (error) {
    console.error("Check upvote error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
