"use client";

interface CompactCheck {
  s: number; // 1 = ok, 0 = error
  l: number | null; // latencyMs
}

function formatLatency(ms: number | null): string {
  if (ms === null) return "\u2014";
  return `${ms}ms`;
}

export default function UptimeBar({
  checks,
  slots = 144,
}: {
  checks: CompactCheck[];
  slots?: number;
}) {
  const padded = Array.from({ length: slots }, (_, i) => {
    const idx = checks.length - (slots - i);
    return idx >= 0 ? checks[idx] : null;
  });

  return (
    <div className="flex gap-px items-end h-5">
      {padded.map((check, i) => (
        <div
          key={i}
          className={`w-[3px] rounded-sm ${
            check
              ? check.s === 1
                ? "bg-emerald-500"
                : "bg-red-500"
              : "bg-zinc-800"
          }`}
          style={{
            height: check
              ? check.s === 1
                ? `${Math.max(40, Math.min(100, 100 - (check.l ?? 0) / 10))}%`
                : "20%"
              : "10%",
            opacity: check ? 1 : 0.3,
          }}
          title={
            check
              ? `${check.s === 1 ? "OK" : "Error"} \u2014 ${formatLatency(check.l)}`
              : "No data"
          }
        />
      ))}
    </div>
  );
}
