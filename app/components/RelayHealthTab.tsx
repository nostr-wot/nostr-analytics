"use client";

import type { AnalyticsData, RelayHealthScore, RelayHealthSeverity, TimezoneWindow } from "@/lib/types";

const scoreConfig: Record<RelayHealthScore, { label: string; color: string; bg: string }> = {
  good: { label: "Good", color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/30" },
  "needs-attention": { label: "Needs Attention", color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/30" },
  poor: { label: "Poor", color: "text-red-400", bg: "bg-red-400/10 border-red-400/30" },
};

const severityConfig: Record<RelayHealthSeverity, { color: string; border: string }> = {
  error: { color: "text-red-400", border: "border-red-400/30" },
  warning: { color: "text-amber-400", border: "border-amber-400/30" },
  info: { color: "text-blue-400", border: "border-blue-400/30" },
};

function formatOffset(offset: number): string {
  const sign = offset >= 0 ? "+" : "";
  return `UTC${sign}${offset}`;
}

export default function RelayHealthTab({ data }: { data: AnalyticsData }) {
  const health = data.relayHealth;
  const nip65 = data.nip65Relays;

  return (
    <div className="space-y-6">
      {/* Section 1: Report Card */}
      {health ? (
        <div className="space-y-4">
          {/* Score badge */}
          <div className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 ${scoreConfig[health.score].bg}`}>
            <span className={`text-lg font-semibold ${scoreConfig[health.score].color}`}>
              {scoreConfig[health.score].label}
            </span>
            <span className="text-sm text-zinc-400">
              {health.issues.length === 0
                ? "No issues found"
                : `${health.issues.length} issue${health.issues.length > 1 ? "s" : ""} found`}
            </span>
          </div>

          {/* Issues */}
          {health.issues.length > 0 && (
            <div className="space-y-2">
              {health.issues.map((issue) => (
                <div
                  key={issue.id}
                  className={`rounded-lg border ${severityConfig[issue.severity].border} bg-zinc-900 p-4`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`text-sm font-medium ${severityConfig[issue.severity].color}`}>
                      {issue.severity === "info" ? "i" : "!"}
                    </span>
                    <div className="min-w-0">
                      <h4 className={`text-sm font-medium ${severityConfig[issue.severity].color}`}>
                        {issue.title}
                      </h4>
                      <p className="text-xs text-zinc-400 mt-1">{issue.description}</p>
                      {issue.relays && issue.relays.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {issue.relays.map((url) => {
                            let host: string;
                            try { host = new URL(url).hostname; } catch { host = url; }
                            return (
                              <span key={url} className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                {host}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {health.recommendations.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <h3 className="text-sm font-medium text-zinc-300 mb-3">Recommendations</h3>
              <ul className="space-y-2">
                {health.recommendations.map((rec, i) => (
                  <li key={i} className="text-xs text-zinc-400 flex items-start gap-2">
                    <span className="text-zinc-600 mt-0.5">-</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">No relay health data available. Stats may need recomputation.</p>
      )}

      {/* Section 2: Relay Table */}
      {nip65.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Declared Relays</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left py-2 pr-4 font-medium">Relay</th>
                  <th className="text-left py-2 pr-4 font-medium">Type</th>
                  <th className="text-left py-2 pr-4 font-medium">Health</th>
                  <th className="text-right py-2 pr-4 font-medium">Events</th>
                  <th className="text-right py-2 font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {nip65.map((relay) => {
                  let host: string;
                  try { host = new URL(relay.url).hostname; } catch { host = relay.url; }
                  const healthColor = {
                    active: "bg-emerald-400",
                    reachable: "bg-amber-400",
                    unreachable: "bg-red-400",
                    unknown: "bg-zinc-500",
                  }[relay.health];
                  const healthLabel = {
                    active: "Active",
                    reachable: "Reachable",
                    unreachable: "Unreachable",
                    unknown: "Unknown",
                  }[relay.health];
                  const markerLabel = relay.marker === "read" ? "Read" : relay.marker === "write" ? "Write" : "Read/Write";
                  const markerColor = relay.marker === "read" ? "text-blue-400" : relay.marker === "write" ? "text-orange-400" : "text-zinc-300";
                  const isSpecial = /nwc|wallet|alby|mutiny|coinos|dvm|pay/i.test(relay.url);
                  const eventCount = data.totalEvents > 0 ? Math.round(relay.eventPercent * data.totalEvents / 100) : 0;

                  return (
                    <tr key={relay.url} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-zinc-200">{host}</span>
                          {isSpecial && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                              SPECIAL
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`py-2 pr-4 ${markerColor}`}>{markerLabel}</td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${healthColor}`} />
                          <span className="text-zinc-400">{healthLabel}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-400 tabular-nums">{eventCount.toLocaleString()}</td>
                      <td className="py-2 text-right text-zinc-400 tabular-nums">{relay.eventPercent}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section 3: Timezone Timeline */}
      {data.timezoneTimeline.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-2">Timezone Timeline</h3>
          <p className="text-xs text-zinc-500 mb-4">
            Estimated timezone per month based on activity patterns. Shifts may indicate travel.
          </p>
          <div className="space-y-1">
            {data.timezoneTimeline.map((w: TimezoneWindow, i: number) => {
              const prev = i > 0 ? data.timezoneTimeline[i - 1] : null;
              const shifted = prev !== null && prev.estimatedOffset !== w.estimatedOffset;
              return (
                <div
                  key={w.period}
                  className={`flex items-center gap-3 px-3 py-2 rounded text-xs ${
                    shifted ? "bg-amber-500/10 border border-amber-500/20" : "bg-zinc-800/50"
                  }`}
                >
                  <span className="font-mono text-zinc-400 w-16">{w.period}</span>
                  <span className={`font-semibold w-16 ${shifted ? "text-amber-400" : "text-zinc-200"}`}>
                    {formatOffset(w.estimatedOffset)}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    w.confidence === "high" ? "bg-emerald-500/20 text-emerald-400"
                    : w.confidence === "medium" ? "bg-zinc-700 text-zinc-300"
                    : "bg-zinc-800 text-zinc-500"
                  }`}>
                    {w.confidence}
                  </span>
                  <span className="text-zinc-600 ml-auto">{w.eventCount} events</span>
                  {shifted && (
                    <span className="text-amber-400 text-[10px] font-medium">
                      shifted from {formatOffset(prev!.estimatedOffset)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
