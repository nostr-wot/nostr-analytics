const T_CUTOFF = 5;
const PEAK_PRIOR = 15.0;

interface EstimationInput {
  timestamps: number[]; // Unix timestamps (createdAt from NostrEvent)
}

export interface EstimationResult {
  estimatedUtcOffset: number;
  confidence: "low" | "medium" | "high";
  activityPeakUtc: number;
  eventCount: number;
  daySpread: number;
  stddevHours: number;
  flaggedUnreliable: boolean;
}

function getAdjustedHourAndDay(ts: number): { hour: number; dayKey: string } {
  const date = new Date(ts * 1000);
  const h = date.getUTCHours() + date.getUTCMinutes() / 60;

  if (h < T_CUTOFF) {
    // Attribute to previous day's session
    const prevDay = new Date(ts * 1000);
    prevDay.setUTCDate(prevDay.getUTCDate() - 1);
    const dayKey = prevDay.toISOString().slice(0, 10);
    return { hour: h - 24, dayKey };
  }

  const dayKey = date.toISOString().slice(0, 10);
  return { hour: h, dayKey };
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values: number[], mu: number): number {
  const variance =
    values.reduce((sum, v) => sum + (v - mu) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function snapToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function estimateTimezone(
  input: EstimationInput
): EstimationResult | null {
  const { timestamps } = input;

  if (timestamps.length === 0) return null;

  // a) Adjust hours with circadian continuity correction
  const days = new Set<string>();
  const adjustedHours: number[] = [];

  for (const ts of timestamps) {
    const { hour, dayKey } = getAdjustedHourAndDay(ts);
    adjustedHours.push(hour);
    days.add(dayKey);
  }

  const N = adjustedHours.length;
  const D = days.size;

  // c) Minimum data check
  if (N < 5 || D < 2) return null;

  // b) Compute statistics
  const muActivity = mean(adjustedHours);
  const sigma = stddev(adjustedHours, muActivity);

  // d) Score candidate offsets
  let bestOffset = 0;
  let bestScore = -Infinity;

  for (let z = -12; z <= 14; z += 0.5) {
    const localPeak = muActivity + z;
    const score = -Math.abs(localPeak - PEAK_PRIOR);
    if (score > bestScore) {
      bestScore = score;
      bestOffset = z;
    }
  }

  const estimatedUtcOffset = snapToHalf(bestOffset);

  // e) Confidence & reliability
  const flaggedUnreliable = sigma > 4.0;

  let confidence: "low" | "medium" | "high";
  if (N >= 30 && D >= 7 && sigma <= 3) {
    confidence = "high";
  } else if (N >= 10 && D >= 3 && sigma <= 4) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return {
    estimatedUtcOffset,
    confidence,
    activityPeakUtc: muActivity,
    eventCount: N,
    daySpread: D,
    stddevHours: sigma,
    flaggedUnreliable,
  };
}
