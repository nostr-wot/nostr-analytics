import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/events/kinds?pubkey=hex - get distinct kinds for a pubkey
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pubkey = searchParams.get("pubkey");

  if (!pubkey) {
    return NextResponse.json(
      { error: "pubkey query param is required" },
      { status: 400 }
    );
  }

  const kinds = await prisma.nostrEvent.groupBy({
    by: ["kind"],
    where: { pubkeyHex: pubkey },
    _count: { kind: true },
    orderBy: { kind: "asc" },
  });

  return NextResponse.json(
    kinds.map((k) => ({ kind: k.kind, count: k._count.kind }))
  );
}
