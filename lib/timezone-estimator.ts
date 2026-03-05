interface EstimationInput {
  timestamps: number[]; // Unix timestamps (createdAt from NostrEvent)
}

export interface EstimationResult {
  estimatedUtcOffset: number;
  confidence: "low" | "medium" | "high";
  activityPeakUtc: number;   // reused: sleep gap midpoint in UTC
  eventCount: number;
  daySpread: number;
  stddevHours: number;        // reused: gap quality ratio (gapLowSum / peakCount)
  flaggedUnreliable: boolean;
}

function snapToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/**
 * Sleep gap detection algorithm for timezone estimation.
 *
 * 1. Build 24-bin histogram of event counts per UTC hour
 * 2. Find longest contiguous run of hours below 15% of peak (wrap-around)
 * 3. Gap midpoint = estimated sleep center in UTC
 * 4. Offset = 3.5 (assumed local sleep center) - gap midpoint
 * 5. Normalize to [-12, 14], snap to 0.5h increments
 */
export function estimateTimezone(
  input: EstimationInput
): EstimationResult | null {
  const { timestamps } = input;

  if (timestamps.length === 0) return null;

  // Extract distinct days and build 24-bin histogram
  const days = new Set<string>();
  const bins = new Array(24).fill(0);

  for (const ts of timestamps) {
    const date = new Date(ts * 1000);
    const hour = date.getUTCHours();
    bins[hour]++;
    days.add(date.toISOString().slice(0, 10));
  }

  const N = timestamps.length;
  const D = days.size;

  // Minimum data check
  if (N < 5 || D < 2) return null;

  const peakCount = Math.max(...bins);
  const threshold = peakCount * 0.15;

  // Find longest contiguous gap below threshold using doubled array (wrap-around)
  let bestStart = 0;
  let bestLength = 0;
  let currentStart = 0;
  let currentLength = 0;

  for (let i = 0; i < 48; i++) {
    const hour = i % 24;
    if (bins[hour] <= threshold) {
      if (currentLength === 0) currentStart = i;
      currentLength++;
      if (currentLength > bestLength) {
        bestLength = currentLength;
        bestStart = currentStart;
      }
    } else {
      currentLength = 0;
    }
  }

  // Cap gap length at 24 (can't be longer than a full day)
  if (bestLength > 24) bestLength = 24;

  // Gap midpoint = sleep center in UTC
  const gapMidpoint = ((bestStart + bestLength / 2) % 24);

  // Offset: assumed local sleep center is 3:30 AM
  const LOCAL_SLEEP_CENTER = 3.5;
  let rawOffset = LOCAL_SLEEP_CENTER - gapMidpoint;

  // Normalize to [-12, 14]
  if (rawOffset < -12) rawOffset += 24;
  if (rawOffset > 14) rawOffset -= 24;

  const estimatedUtcOffset = snapToHalf(
    Math.max(-12, Math.min(14, rawOffset))
  );

  // Gap quality ratio: sum of counts in gap hours / peak count
  let gapLowSum = 0;
  for (let i = 0; i < bestLength; i++) {
    gapLowSum += bins[(bestStart + i) % 24];
  }
  const gapRatio = peakCount > 0 ? gapLowSum / peakCount : 1;

  // Confidence
  const flaggedUnreliable = bestLength < 4;

  let confidence: "low" | "medium" | "high";
  if (N >= 30 && D >= 7 && gapRatio < 0.1 && bestLength >= 5) {
    confidence = "high";
  } else if (N >= 10 && D >= 3 && bestLength >= 4) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return {
    estimatedUtcOffset,
    confidence,
    activityPeakUtc: gapMidpoint,   // sleep gap center in UTC
    eventCount: N,
    daySpread: D,
    stddevHours: gapRatio,           // gap quality ratio
    flaggedUnreliable,
  };
}

export interface TimezoneWindowResult {
  period: string;          // "2025-01"
  estimatedOffset: number;
  confidence: "low" | "medium" | "high";
  eventCount: number;
}

/**
 * Compute timezone estimates per month using the sleep-gap algorithm.
 * Groups timestamps by month and runs estimation on each month.
 */
export function computeTimezoneTimeline(
  timestamps: number[]
): TimezoneWindowResult[] {
  if (timestamps.length === 0) return [];

  // Group timestamps by month
  const monthMap = new Map<string, number[]>();
  for (const ts of timestamps) {
    const date = new Date(ts * 1000);
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const arr = monthMap.get(month) ?? [];
    arr.push(ts);
    monthMap.set(month, arr);
  }

  // Sort months chronologically
  const sortedMonths = [...monthMap.keys()].sort();

  const results: TimezoneWindowResult[] = [];
  for (const month of sortedMonths) {
    const monthTimestamps = monthMap.get(month)!;
    const estimate = estimateTimezone({ timestamps: monthTimestamps });
    if (estimate) {
      results.push({
        period: month,
        estimatedOffset: estimate.estimatedUtcOffset,
        confidence: estimate.confidence,
        eventCount: monthTimestamps.length,
      });
    }
  }

  return results;
}
