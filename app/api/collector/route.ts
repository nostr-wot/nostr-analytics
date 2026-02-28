import { NextRequest, NextResponse } from "next/server";
import {
  startScheduler,
  stopScheduler,
  isSchedulerRunning,
} from "@/lib/scheduler";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// GET /api/collector - get scheduler status + stats
export async function GET() {
  const [running, globalStats] = await Promise.all([
    Promise.resolve(isSchedulerRunning()),
    prisma.globalStats.findUnique({ where: { id: 1 } }),
  ]);

  return NextResponse.json({
    running,
    totalEvents: globalStats?.totalEvents ?? 0,
    totalCacheResponses: globalStats?.totalCacheResponses ?? 0,
  });
}

// POST /api/collector - start/stop scheduler
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { action } = body as { action: "start" | "stop" };

  if (action === "start") {
    startScheduler();
    // Small delay to let the worker write its PID file
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ running: isSchedulerRunning() });
  }

  if (action === "stop") {
    stopScheduler();
    // Small delay to let the worker clean up its PID file
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ running: isSchedulerRunning() });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
