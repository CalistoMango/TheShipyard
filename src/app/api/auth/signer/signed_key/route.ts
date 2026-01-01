import { NextRequest, NextResponse } from 'next/server';
import { getNeynarClient } from '~/lib/neynar';
import { mnemonicToAccount } from 'viem/accounts';
import {
  SIGNED_KEY_REQUEST_TYPE,
  SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN,
} from '~/lib/constants';
import { validateAuth, isAdminFid } from '~/lib/auth';

const postRequiredFields = ['signerUuid', 'publicKey'];

/**
 * POST /api/auth/signer/signed_key
 *
 * SECURITY: This endpoint uses the app's SEED_PHRASE to sign keys.
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

  const body = await request.json();

  // Validate required fields
  for (const field of postRequiredFields) {
    if (!body[field]) {
      return NextResponse.json(
        { error: `${field} is required` },
        { status: 400 }
      );
    }
  }

  const { signerUuid, publicKey, redirectUrl } = body;

  if (redirectUrl && typeof redirectUrl !== 'string') {
    return NextResponse.json(
      { error: 'redirectUrl must be a string' },
      { status: 400 }
    );
  }

  try {
    // Get the app's account from seed phrase
    const seedPhrase = process.env.SEED_PHRASE;
    const shouldSponsor = process.env.SPONSOR_SIGNER === 'true';

    if (!seedPhrase) {
      return NextResponse.json(
        { error: 'App configuration missing (SEED_PHRASE or FID)' },
        { status: 500 }
      );
    }

    const neynarClient = getNeynarClient();

    const account = mnemonicToAccount(seedPhrase);

    const {
      user: { fid },
    } = await neynarClient.lookupUserByCustodyAddress({
      custodyAddress: account.address,
    });

    const appFid = fid;

    // Generate deadline (24 hours from now)
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    // Generate EIP-712 signature
    const signature = await account.signTypedData({
      domain: SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN,
      types: {
        SignedKeyRequest: SIGNED_KEY_REQUEST_TYPE,
      },
      primaryType: 'SignedKeyRequest',
      message: {
        requestFid: BigInt(appFid),
        key: publicKey,
        deadline: BigInt(deadline),
      },
    });

    const signer = await neynarClient.registerSignedKey({
      appFid,
      deadline,
      signature,
      signerUuid,
      ...(redirectUrl && { redirectUrl }),
      ...(shouldSponsor && { sponsor: { sponsored_by_neynar: true } }),
    });

    return NextResponse.json(signer);
  } catch (error) {
    console.error('Error registering signed key:', error);
    return NextResponse.json(
      { error: 'Failed to register signed key' },
      { status: 500 }
    );
  }
}
