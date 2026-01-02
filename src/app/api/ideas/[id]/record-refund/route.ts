import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/ideas/[id]/record-refund
 *
 * V2: Per-project refund recording - uses the idea ID from the URL.
 * This endpoint forwards to /api/record-refund with the idea_id included.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ideaId = parseInt(id, 10);

  if (isNaN(ideaId)) {
    return NextResponse.json({ error: "Invalid idea ID" }, { status: 400 });
  }

  // Clone the request and forward to the global endpoint with idea_id
  const body = await request.json();
  const globalUrl = new URL("/api/record-refund", request.url);

  // Forward all headers including auth
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");

  // v2: Include idea_id from URL path
  const response = await fetch(globalUrl.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify({ ...body, idea_id: ideaId }),
  });

  const result = await response.json();

  return NextResponse.json(result, { status: response.status });
}
