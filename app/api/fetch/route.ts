import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchAllForPubkey, runCollectionCycle } from "@/lib/collector";
import { requireAuth } from "@/lib/auth";

// POST /api/fetch - trigger a manual fetch
// Body: { pubkeyHex?: string } - if provided, fetch for that pubkey only; otherwise fetch all
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const { pubkeyHex } = body as { pubkeyHex?: string };

  if (pubkeyHex) {
    const tracked = await prisma.trackedNpub.findUnique({
      where: { pubkeyHex },
    });
    if (!tracked) {
      return NextResponse.json(
        { error: "Pubkey not tracked" },
        { status: 404 }
      );
    }

    const result = await fetchAllForPubkey(pubkeyHex);
    return NextResponse.json(result);
  }

  // Fetch all
  await runCollectionCycle();
  return NextResponse.json({ status: "complete" });
}
