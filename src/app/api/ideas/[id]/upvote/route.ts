import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { validateAuth, validateFidMatch } from "~/lib/auth";
import { ensureUserExists } from "~/lib/user";
import { parseId } from "~/lib/utils";

interface UpvoteRequest {
  user_fid: number;
}

// POST /api/ideas/[id]/upvote - Toggle upvote
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = parseId(id, "idea ID");
  if (!parsed.valid) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const ideaId = parsed.id;

  try {
    // Validate authentication
    const auth = await validateAuth(request);
    if (!auth.authenticated || !auth.fid) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as UpvoteRequest;

    if (!body.user_fid) {
      return NextResponse.json(
        { error: "Missing required field: user_fid" },
        { status: 400 }
      );
    }

    // Verify authenticated user matches requested FID
    const fidError = validateFidMatch(auth.fid, body.user_fid);
    if (fidError) {
      return NextResponse.json({ error: fidError }, { status: 403 });
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

    // Ensure user exists with profile info
    await ensureUserExists(body.user_fid);

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

      // ATOMIC: Sync upvote_count with actual table count
      const { data: newCount } = await supabase
        .rpc("sync_upvote_count", { idea_id_param: ideaId });

      return NextResponse.json({
        status: "removed",
        upvoted: false,
        upvote_count: newCount || 0,
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

      // ATOMIC: Sync upvote_count with actual table count
      const { data: newCount } = await supabase
        .rpc("sync_upvote_count", { idea_id_param: ideaId });

      return NextResponse.json({
        status: "added",
        upvoted: true,
        upvote_count: newCount || 0,
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
