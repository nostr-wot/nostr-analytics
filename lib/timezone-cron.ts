import { prisma } from "@/lib/db";
import { estimateTimezone } from "@/lib/timezone-estimator";

export async function runTimezoneEstimation(): Promise<void> {
  const trackedUsers = await prisma.trackedNpub.findMany({
    select: { pubkeyHex: true },
  });

  if (trackedUsers.length === 0) {
    console.log("[timezone] No tracked users, skipping.");
    return;
  }

  let estimated = 0;
  let skipped = 0;
  const confidenceCounts = { high: 0, medium: 0, low: 0 };

  for (const { pubkeyHex } of trackedUsers) {
    const events = await prisma.nostrEvent.findMany({
      where: { pubkeyHex },
      select: { createdAt: true },
    });

    const timestamps = events.map((e: { createdAt: number }) => e.createdAt);
    const result = estimateTimezone({ timestamps });

    if (!result) {
      skipped++;
      continue;
    }

    await prisma.timezoneEstimate.upsert({
      where: { pubkeyHex },
      create: {
        pubkeyHex,
        estimatedUtcOffset: result.estimatedUtcOffset,
        confidence: result.confidence,
        activityPeakUtc: result.activityPeakUtc,
        eventCount: result.eventCount,
        daySpread: result.daySpread,
        stddevHours: result.stddevHours,
        flaggedUnreliable: result.flaggedUnreliable,
      },
      update: {
        estimatedUtcOffset: result.estimatedUtcOffset,
        confidence: result.confidence,
        activityPeakUtc: result.activityPeakUtc,
        eventCount: result.eventCount,
        daySpread: result.daySpread,
        stddevHours: result.stddevHours,
        flaggedUnreliable: result.flaggedUnreliable,
        lastComputedAt: new Date(),
      },
    });

    estimated++;
    confidenceCounts[result.confidence]++;
  }

  console.log(
    `[timezone] ${estimated} users estimated (${confidenceCounts.high} high, ${confidenceCounts.medium} medium, ${confidenceCounts.low} low), ${skipped} skipped`
  );
}
