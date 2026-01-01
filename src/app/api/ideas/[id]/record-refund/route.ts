import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/ideas/[id]/record-refund
 *
 * @deprecated Use POST /api/record-refund instead.
 *
 * This per-idea endpoint is DEPRECATED because on-chain refunds are cumulative
 * across ALL eligible ideas. A single on-chain refund transaction claims all
 * eligible funding at once, so recording must also be global.
 *
 * This endpoint now redirects to the global /api/record-refund endpoint.
 * The idea ID in the URL is ignored - all eligible funding will be marked.
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

  // Clone the request and forward to the global endpoint
  const body = await request.json();
  const globalUrl = new URL("/api/record-refund", request.url);

  // Forward all headers including auth
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");

  const response = await fetch(globalUrl.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const result = await response.json();

  // Add deprecation warning to response
  if (result.success) {
    result.warning = "This endpoint is deprecated. Use POST /api/record-refund instead.";
    result.deprecated_idea_id = ideaId;
  }

  return NextResponse.json(result, { status: response.status });
}
