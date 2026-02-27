import { NextRequest, NextResponse } from "next/server";
import { getSchedulerLog } from "@/lib/scheduler";

export async function GET(request: NextRequest) {
  const parsed = parseInt(
    request.nextUrl.searchParams.get("lines") || "50",
    10
  );
  const lines = isNaN(parsed) || parsed < 1 ? 50 : Math.min(parsed, 1000);
  const log = getSchedulerLog(lines);
  return NextResponse.json({ log });
}
