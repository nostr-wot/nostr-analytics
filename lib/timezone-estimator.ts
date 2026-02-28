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

  // Extract raw UTC hours and distinct days
  const days = new Set<string>();
  const hours: number[] = [];

  for (const ts of timestamps) {
    const date = new Date(ts * 1000);
    const h = date.getUTCHours() + date.getUTCMinutes() / 60;
    hours.push(h);
    days.add(date.toISOString().slice(0, 10));
  }

  const N = hours.length;
  const D = days.size;

  // Minimum data check
  if (N < 5 || D < 2) return null;

  // Compute statistics on raw UTC hours
  const muActivity = mean(hours);
  const sigma = stddev(hours, muActivity);

  // Estimate offset: place mean activity at 3 PM local
  const rawOffset = PEAK_PRIOR - muActivity;
  // Clamp to valid range and snap to 0.5h
  const estimatedUtcOffset = snapToHalf(
    Math.max(-12, Math.min(14, rawOffset))
  );

  // Confidence & reliability
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
