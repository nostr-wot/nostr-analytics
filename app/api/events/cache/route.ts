import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/events/cache?pubkey=hex&queryType=user_profile&page=1&limit=50
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pubkey = searchParams.get("pubkey");
  const queryType = searchParams.get("queryType");
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
  if (queryType) where.queryType = queryType;

  const [responses, total] = await Promise.all([
    prisma.cacheResponse.findMany({
      where,
      orderBy: { fetchedAt: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.cacheResponse.count({ where }),
  ]);

  const parsed = responses.map((r) => ({
    ...r,
    content: JSON.parse(r.content),
  }));

  return NextResponse.json({
    responses: parsed,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
