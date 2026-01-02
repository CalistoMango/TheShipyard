import { NextRequest, NextResponse } from "next/server";
import { validateAuth, validateFidMatch } from "~/lib/auth";
import { recordRefund } from "~/lib/record-refund";

/**
 * POST /api/record-refund
 *
 * Record a successful refund claim after on-chain transaction.
 * V2: Per-project refund recording - only marks funding for the specific idea.
 *
 * This endpoint:
 * 1. Verifies the tx_hash on-chain with projectId
 * 2. Checks the tx_hash hasn't been used before
 * 3. Verifies on-chain amount matches DB-eligible funding for THIS idea
 * 4. Marks funding records for THIS idea as refunded
 * 5. Updates the specific idea's pool
 * 6. Records tx_hash in history table
 *
 * SECURITY: Requires authentication and FID must match.
 * V2: Each (projectId, fid) pair can only claim once on-chain.
 */
export async function POST(request: NextRequest) {
  try {
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

    // Call shared logic
    const result = await recordRefund({
      user_fid: body.user_fid,
      tx_hash: body.tx_hash,
      amount: body.amount,
      idea_id: body.idea_id,
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
