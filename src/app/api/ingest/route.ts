import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { classifyCast } from "~/lib/llm";

interface IngestRequest {
  cast_hash: string;
  cast_text: string;
  author_fid: number;
  author_username?: string;
  author_display_name?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as IngestRequest;

    console.log("[INGEST] Received cast:", {
      hash: body.cast_hash,
      text: body.cast_text?.substring(0, 100),
      author_fid: body.author_fid,
    });

    // Validate required fields
    if (!body.cast_hash || !body.cast_text || !body.author_fid) {
      return NextResponse.json(
        { error: "Missing required fields: cast_hash, cast_text, author_fid" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Check if this cast has already been processed
    const { data: existingWithCast } = await supabase
      .from("ideas")
      .select("id")
      .eq("cast_hash", body.cast_hash)
      .single();

    if (existingWithCast) {
      return NextResponse.json({
        status: "skipped",
        reason: "Cast already processed as primary idea",
        idea_id: existingWithCast.id,
      });
    }

    // Check if cast is in any related_casts
    const { data: existingRelated } = await supabase
      .from("ideas")
      .select("id")
      .contains("related_casts", [body.cast_hash])
      .single();

    if (existingRelated) {
      return NextResponse.json({
        status: "skipped",
        reason: "Cast already processed as related cast",
        idea_id: existingRelated.id,
      });
    }

    // Ensure user exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("fid")
      .eq("fid", body.author_fid)
      .single();

    if (!existingUser) {
      await supabase.from("users").insert({
        fid: body.author_fid,
        username: body.author_username || null,
        display_name: body.author_display_name || body.author_username || null,
      });
    }

    // Fetch existing ideas for duplicate detection
    const { data: existingIdeas } = await supabase
      .from("ideas")
      .select("id, title, description")
      .order("created_at", { ascending: false })
      .limit(100);

    // Classify the cast using LLM
    console.log("[INGEST] Calling LLM classification with", existingIdeas?.length || 0, "existing ideas");
    const classification = await classifyCast(
      body.cast_text,
      existingIdeas || []
    );
    console.log("[INGEST] Classification result:", JSON.stringify(classification));

    if (classification.type === "rejected") {
      // Log rejection but don't create idea
      console.log(`[INGEST] Rejected cast ${body.cast_hash}: ${classification.reason}`);
      return NextResponse.json({
        status: "rejected",
        reason: classification.reason,
      });
    }

    if (classification.type === "duplicate") {
      // Add cast to existing idea's related_casts
      const { data: existingIdea } = await supabase
        .from("ideas")
        .select("related_casts")
        .eq("id", classification.existingIdeaId)
        .single();

      if (existingIdea) {
        const relatedCasts = existingIdea.related_casts || [];
        relatedCasts.push(body.cast_hash);

        await supabase
          .from("ideas")
          .update({ related_casts: relatedCasts })
          .eq("id", classification.existingIdeaId);

        return NextResponse.json({
          status: "duplicate",
          idea_id: classification.existingIdeaId,
          reason: classification.reason,
        });
      }

      // If existing idea not found, treat as new
      console.log(`Duplicate target ${classification.existingIdeaId} not found, creating new idea`);
    }

    // Create new idea
    if (classification.type === "new" || classification.type === "duplicate") {
      const newIdea = classification.type === "new" ? classification : {
        category: "other" as const,
        title: body.cast_text.slice(0, 100),
        description: body.cast_text,
      };

      const { data: createdIdea, error: createError } = await supabase
        .from("ideas")
        .insert({
          title: newIdea.title,
          description: newIdea.description,
          category: newIdea.category,
          status: "open",
          cast_hash: body.cast_hash,
          submitter_fid: body.author_fid,
          pool: 0,
          upvote_count: 0,
        })
        .select("id")
        .single();

      if (createError) {
        console.error("[INGEST] Error creating idea:", createError);
        return NextResponse.json(
          { error: "Failed to create idea" },
          { status: 500 }
        );
      }

      console.log("[INGEST] Created new idea:", createdIdea.id, newIdea.title);
      return NextResponse.json({
        status: "created",
        idea_id: createdIdea.id,
        category: newIdea.category,
        title: newIdea.title,
      });
    }

    return NextResponse.json({ error: "Unexpected classification result" }, { status: 500 });
  } catch (error) {
    console.error("Ingest error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
