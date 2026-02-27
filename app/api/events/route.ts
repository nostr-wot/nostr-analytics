import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/events?pubkey=hex&kind=0&page=1&limit=50&source=cache
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pubkey = searchParams.get("pubkey");
  const kind = searchParams.get("kind");
  const source = searchParams.get("source");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
  const offset = (page - 1) * limit;

  if (!pubkey) {
    return NextResponse.json(
      { error: "pubkey query param is required" },
      { status: 400 }
    );
  }

  const where: Record<string, unknown> = { pubkeyHex: pubkey };
  if (kind !== null && kind !== "") where.kind = parseInt(kind, 10);
  if (source) where.source = source;
  if (search) {
    where.OR = [
      { content: { contains: search } },
      { tags: { contains: search } },
    ];
  }

  const [events, total] = await Promise.all([
    prisma.nostrEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.nostrEvent.count({ where }),
  ]);

  // Parse tags back to arrays
  const parsed = events.map((e) => ({
    ...e,
    tags: JSON.parse(e.tags),
  }));

  return NextResponse.json({
    events: parsed,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
