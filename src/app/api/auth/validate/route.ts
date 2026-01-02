import { NextResponse } from 'next/server';
import { createClient, Errors } from '@farcaster/quick-auth';

const client = createClient();

export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // SECURITY: Require NEXT_PUBLIC_URL in production to prevent Host header spoofing
    if (!process.env.NEXT_PUBLIC_URL && process.env.NODE_ENV === 'production') {
      console.error('Auth validation failed: NEXT_PUBLIC_URL not configured in production');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const domain = process.env.NEXT_PUBLIC_URL
      ? new URL(process.env.NEXT_PUBLIC_URL).hostname
      : 'localhost'; // Only used in development

    try {
      // Use the official QuickAuth library to verify the JWT
      const payload = await client.verifyJwt({
        token,
        domain,
      });

      return NextResponse.json({
        success: true,
        user: {
          fid: payload.sub,
        },
      });
    } catch (e) {
      if (e instanceof Errors.InvalidTokenError) {
        console.info('Invalid token:', e.message);
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
      throw e;
    }
  } catch (error) {
    console.error('Token validation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}