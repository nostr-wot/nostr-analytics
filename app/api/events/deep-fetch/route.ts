import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { deepFetchAllRelays } from "@/lib/collector";
import { recomputeStatsForPubkey } from "@/lib/stats-cron";

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const { pubkeyHex } = body as { pubkeyHex?: string };

  if (!pubkeyHex) {
    return NextResponse.json(
      { error: "pubkeyHex is required" },
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

  const result = await deepFetchAllRelays(pubkeyHex);
  await recomputeStatsForPubkey(pubkeyHex);
  return NextResponse.json(result);
}
