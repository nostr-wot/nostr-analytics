import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { fetchFromSingleRelayExhaustive } from "@/lib/collector";
import { recomputeStatsForPubkey } from "@/lib/stats-cron";

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const { pubkeyHex, relayUrl } = body as {
    pubkeyHex?: string;
    relayUrl?: string;
  };

  if (!pubkeyHex || !relayUrl) {
    return NextResponse.json(
      { error: "pubkeyHex and relayUrl are required" },
      { status: 400 }
    );
  }

  // Basic URL validation
  try {
    new URL(relayUrl);
  } catch {
    return NextResponse.json(
      { error: "Invalid relay URL" },
      { status: 400 }
    );
  }

  const tracked = await prisma.trackedNpub.findUnique({
    where: { pubkeyHex },
  });
  if (!tracked) {
    return NextResponse.json(
      { error: "Pubkey not tracked" },
      { status: 404 }
    );
  }

  const result = await fetchFromSingleRelayExhaustive(relayUrl, pubkeyHex);
  await recomputeStatsForPubkey(pubkeyHex);
  return NextResponse.json(result);
}
