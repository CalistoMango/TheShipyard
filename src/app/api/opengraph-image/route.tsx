import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_URL || "https://the-shipyard.vercel.app";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title');
  const pool = searchParams.get('pool');

  const logoUrl = `${APP_URL}/logo-white-full.png`;

  // If specific idea params provided, show idea-specific OG
  if (title) {
    return new ImageResponse(
      (
        <div tw="flex h-full w-full flex-col justify-center items-center relative bg-[#030712]">
          <div tw="flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="The Shipyard" width={200} height={200} tw="mb-6" />
            <h1 tw="text-5xl text-white text-center max-w-4xl px-8">{title}</h1>
            {pool && Number(pool) > 0 && (
              <div tw="flex items-center mt-8 bg-emerald-500/20 px-8 py-4 rounded-2xl">
                <span tw="text-4xl text-emerald-400 font-bold">${pool} pool</span>
              </div>
            )}
            <p tw="text-3xl mt-8 text-gray-400">Fund this idea or build it on The Shipyard</p>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  }

  // Default OG image for the app
  return new ImageResponse(
    (
      <div tw="flex h-full w-full flex-col justify-center items-center relative bg-[#030712]">
        <div tw="flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="The Shipyard" width={250} height={250} tw="mb-6" />
          <h1 tw="text-7xl text-white font-bold">The Shipyard</h1>
          <p tw="text-4xl mt-6 text-gray-400">Fund ideas. Race to build. Claim the pool.</p>
          <div tw="flex gap-8 mt-12">
            <div tw="flex flex-col items-center bg-gray-800 px-8 py-6 rounded-2xl">
              <span tw="text-3xl text-emerald-400 font-bold">💰 Fund</span>
              <span tw="text-xl text-gray-400 mt-2">Ideas you want built</span>
            </div>
            <div tw="flex flex-col items-center bg-gray-800 px-8 py-6 rounded-2xl">
              <span tw="text-3xl text-blue-400 font-bold">🔨 Build</span>
              <span tw="text-xl text-gray-400 mt-2">Claim the bounty pool</span>
            </div>
            <div tw="flex flex-col items-center bg-gray-800 px-8 py-6 rounded-2xl">
              <span tw="text-3xl text-purple-400 font-bold">🏆 Earn</span>
              <span tw="text-xl text-gray-400 mt-2">As idea submitter</span>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
