import { NextRequest, NextResponse } from "next/server";
import { validateAuth, validateFidMatch } from "~/lib/auth";
import { recordRefund } from "~/lib/record-refund";

/**
 * POST /api/ideas/[id]/record-refund
 *
 * V2: Per-project refund recording - uses the idea ID from the URL.
 * Calls the shared recordRefund logic directly (no internal fetch).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ideaId = parseInt(id, 10);

    if (isNaN(ideaId)) {
      return NextResponse.json({ error: "Invalid idea ID" }, { status: 400 });
    }

    // Validate authentication
    const auth = await validateAuth(request);
    if (!auth.authenticated || !auth.fid) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

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

    // Call shared logic directly with idea_id from URL
    const result = await recordRefund({
      user_fid: body.user_fid,
      tx_hash: body.tx_hash,
      amount: body.amount,
      idea_id: ideaId,
    });

    return NextResponse.json(
      result.success ? result : { error: result.error },
      { status: result.status || (result.success ? 200 : 500) }
    );
  } catch (error) {
    console.error("Record refund error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
