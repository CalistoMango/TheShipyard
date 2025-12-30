import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { classifyCast } from "~/lib/llm";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const NEYNAR_AGENT_SIGNER_UUID = process.env.NEYNAR_AGENT_SIGNER_UUID;
const APP_URL = process.env.NEXT_PUBLIC_URL || "https://the-shipyard.vercel.app";

interface IngestRequest {
  cast_hash: string;
  cast_text: string;
  author_fid: number;
  author_username?: string;
  author_display_name?: string;
}

async function replyToCast(parentHash: string, text: string): Promise<boolean> {
  if (!NEYNAR_API_KEY || !NEYNAR_AGENT_SIGNER_UUID) {
    console.log("[INGEST] Missing Neynar credentials, skipping reply");
    return false;
  }

  try {
    const response = await fetch("https://api.neynar.com/v2/farcaster/cast", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "x-api-key": NEYNAR_API_KEY,
      },
      body: JSON.stringify({
        signer_uuid: NEYNAR_AGENT_SIGNER_UUID,
        text,
        parent: parentHash,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[INGEST] Failed to reply to cast:", error);
      return false;
    }

    console.log("[INGEST] Successfully replied to cast");
    return true;
  } catch (error) {
    console.error("[INGEST] Error replying to cast:", error);
    return false;
  }
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

    // Ensure user exists and has up-to-date info
    const { data: existingUser } = await supabase
      .from("users")
      .select("fid, username, display_name")
      .eq("fid", body.author_fid)
      .single();

    if (!existingUser) {
      // Create new user
      const { error: insertError } = await supabase.from("users").insert({
        fid: body.author_fid,
        username: body.author_username || null,
        display_name: body.author_display_name || body.author_username || null,
      });
      if (insertError) {
        console.error("[INGEST] Error creating user:", insertError);
      }
    } else if (body.author_username && (!existingUser.username || existingUser.username !== body.author_username)) {
      // Update user if we have better info (username missing or changed)
      const { error: updateError } = await supabase
        .from("users")
        .update({
          username: body.author_username,
          display_name: body.author_display_name || body.author_username || existingUser.display_name,
        })
        .eq("fid", body.author_fid);
      if (updateError) {
        console.error("[INGEST] Error updating user:", updateError);
      } else {
        console.log("[INGEST] Updated user info for fid:", body.author_fid);
      }
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

        // Get the existing idea title for the reply
        const { data: duplicateIdea } = await supabase
          .from("ideas")
          .select("title")
          .eq("id", classification.existingIdeaId)
          .single();

        // Reply to the cast about the duplicate
        const ideaUrl = `${APP_URL}/?idea=${classification.existingIdeaId}`;
        const replyText = `Great minds think alike! 🧠 This idea is similar to "${duplicateIdea?.title || "an existing idea"}" which is already on The Shipyard.\n\nCheck it out and upvote or fund it: ${ideaUrl}`;
        await replyToCast(body.cast_hash, replyText);

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

      // Reply to the cast about the new idea
      const ideaUrl = `${APP_URL}/?idea=${createdIdea.id}`;
      const replyText = `Your idea has been added to The Shipyard! 🚢\n\n"${newIdea.title}" is now live and ready for funding.\n\nView and share it: ${ideaUrl}`;
      await replyToCast(body.cast_hash, replyText);

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
