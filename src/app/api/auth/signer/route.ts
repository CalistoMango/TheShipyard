import { NextRequest, NextResponse } from 'next/server';
import { getNeynarClient } from '~/lib/neynar';
import { validateAuth, isAdminFid } from '~/lib/auth';

/**
 * POST /api/auth/signer
 *
 * SECURITY: Creating signers uses the Neynar API key and incurs costs.
 * Access is restricted to authenticated admin users only.
 */
export async function POST(request: NextRequest) {
  // CRITICAL: Require admin authentication
  const auth = await validateAuth(request);
  if (!auth.authenticated || !auth.fid) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  if (!isAdminFid(auth.fid)) {
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 }
    );
  }

  try {
    const neynarClient = getNeynarClient();
    const signer = await neynarClient.createSigner();
    return NextResponse.json(signer);
  } catch (error) {
    console.error('Error creating signer:', error);
    return NextResponse.json(
      { error: 'Failed to create signer' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/signer
 *
 * Looks up a signer by UUID. Requires authentication to prevent
 * API quota abuse and probing.
 */
export async function GET(request: NextRequest) {
  // Require authentication to prevent API quota abuse
  const auth = await validateAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const signerUuid = searchParams.get('signerUuid');

  if (!signerUuid) {
    return NextResponse.json(
      { error: 'signerUuid is required' },
      { status: 400 }
    );
  }

  try {
    const neynarClient = getNeynarClient();
    const signer = await neynarClient.lookupSigner({
      signerUuid,
    });
    return NextResponse.json(signer);
  } catch (error) {
    console.error('Error fetching signed key:', error);
    return NextResponse.json(
      { error: 'Failed to fetch signed key' },
      { status: 500 }
    );
  }
}
