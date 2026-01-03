import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { getAdminFids } from "~/lib/admin";
import { sendPushNotification } from "~/lib/notifications";
import { validateAuth, validateFidMatch } from "~/lib/auth";
import { ensureUserExists, getDisplayName } from "~/lib/user";
import { checkRejectionCooldown } from "~/lib/time";

interface SubmitBuildRequest {
  idea_id: number;
  builder_fid: number;
  url: string;
  description?: string;
}

// POST /api/builds - Submit a build for an idea
export async function POST(request: NextRequest) {
  try {
    // Validate authentication
    const auth = await validateAuth(request);
    if (!auth.authenticated || !auth.fid) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as SubmitBuildRequest;

    if (!body.idea_id || !body.builder_fid || !body.url) {
      return NextResponse.json(
        { error: "Missing required fields: idea_id, builder_fid, url" },
        { status: 400 }
      );
    }

    // Verify authenticated user matches requested builder FID
    const fidError = validateFidMatch(auth.fid, body.builder_fid);
    if (fidError) {
      return NextResponse.json({ error: fidError }, { status: 403 });
    }

    const supabase = createServerClient();

    // Verify idea exists and is open or racing
    const { data: idea, error: ideaError } = await supabase
      .from("ideas")
      .select("id, status, title")
      .eq("id", body.idea_id)
      .single();

    if (ideaError || !idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    if (idea.status !== "open" && idea.status !== "racing") {
      return NextResponse.json(
        { error: "Cannot submit builds for completed or already-existing ideas" },
        { status: 400 }
      );
    }

    // Ensure builder user exists with profile info
    await ensureUserExists(body.builder_fid);

    // Check for existing pending/voting builds from this builder for this idea
    const { data: existingBuild } = await supabase
      .from("builds")
      .select("id, status, created_at")
      .eq("idea_id", body.idea_id)
      .eq("builder_fid", body.builder_fid)
      .in("status", ["pending_review", "voting"])
      .single();

    if (existingBuild) {
      return NextResponse.json(
        {
          error: "You already have a pending build for this idea",
          existing_build_id: existingBuild.id,
        },
        { status: 400 }
      );
    }

    // Check for rejected build cooldown (24h)
    const { data: rejectedBuild } = await supabase
      .from("builds")
      .select("id, updated_at")
      .eq("idea_id", body.idea_id)
      .eq("builder_fid", body.builder_fid)
      .eq("status", "rejected")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (rejectedBuild) {
      const cooldown = checkRejectionCooldown(rejectedBuild.updated_at);
      if (cooldown.active) {
        return NextResponse.json(
          {
            error: `Cooldown active after rejection. Try again in ${cooldown.hoursRemaining} hours.`,
            cooldown_ends: cooldown.cooldownEnds.toISOString(),
          },
          { status: 400 }
        );
      }
    }

    // Create build in pending_review status (admin must approve to start voting)
    const { data: build, error: buildError } = await supabase
      .from("builds")
      .insert({
        idea_id: body.idea_id,
        builder_fid: body.builder_fid,
        url: body.url,
        description: body.description || null,
        status: "pending_review",
      })
      .select("id, status, created_at")
      .single();

    if (buildError) {
      console.error("Error creating build:", buildError);
      return NextResponse.json(
        { error: "Failed to create build" },
        { status: 500 }
      );
    }

    // Notify admins about new build submission
    const adminFids = getAdminFids();
    for (const adminFid of adminFids) {
      sendPushNotification(
        adminFid,
        "New Build Submitted 🔨",
        `A build was submitted for "${idea.title}". Review it now.`
      ).catch((err) => console.error("Failed to notify admin:", err));
    }

    return NextResponse.json({
      status: "submitted",
      build_id: build.id,
      build_status: build.status,
      message: "Build submitted for admin review",
    });
  } catch (error) {
    console.error("Build submission error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/builds?idea_id=X or /api/builds?builder_fid=Y
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ideaId = searchParams.get("idea_id");
  const builderFid = searchParams.get("builder_fid");

  try {
    const supabase = createServerClient();

    let query = supabase
      .from("builds")
      .select(
        `
        id,
        idea_id,
        builder_fid,
        url,
        description,
        status,
        vote_ends_at,
        votes_approve,
        votes_reject,
        created_at,
        updated_at,
        users:builder_fid (
          username,
          display_name,
          pfp_url
        ),
        ideas:idea_id (
          title,
          pool
        )
      `
      )
      .order("created_at", { ascending: false });

    if (ideaId) {
      query = query.eq("idea_id", parseInt(ideaId, 10));
    }

    if (builderFid) {
      query = query.eq("builder_fid", parseInt(builderFid, 10));
    }

    const { data: builds, error } = await query;

    if (error) {
      console.error("Error fetching builds:", error);
      return NextResponse.json(
        { error: "Failed to fetch builds" },
        { status: 500 }
      );
    }

    // Transform to API format
    // NOTE: Supabase single-row joins return objects, not arrays
    const transformed = builds.map((b) => {
      const user = b.users as unknown as { username: string | null; display_name: string | null; pfp_url: string | null } | null;
      const idea = b.ideas as unknown as { title: string; pool: number } | null;
      return {
        id: b.id,
        idea_id: b.idea_id,
        idea_title: idea?.title || "Unknown",
        idea_pool: idea?.pool ? Number(idea.pool) : 0,
        builder_fid: b.builder_fid,
        builder_name: getDisplayName(user, b.builder_fid),
        builder_pfp: user?.pfp_url || null,
        url: b.url,
        description: b.description,
        status: b.status,
        vote_ends_at: b.vote_ends_at,
        votes_approve: b.votes_approve,
        votes_reject: b.votes_reject,
        created_at: b.created_at,
      };
    });

    return NextResponse.json({ data: transformed });
  } catch (error) {
    console.error("Get builds error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
