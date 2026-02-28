"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import UptimeBar from "../../components/UptimeBar";
import LatencyChart from "../../components/charts/LatencyChart";
import { getKindLabel } from "@/lib/kind-labels";

type Tab = "overview" | "latency" | "errors" | "events";

interface RelayDetail {
  relay: {
    url: string;
    firstSeenAt: string;
    consecutiveErrors: number;
    backoffUntil: string | null;
  };
  uptime: {
    last24h: number | null;
    last7d: number | null;
    totalChecks: number;
  };
  latestCheck: {
    status: string;
    latencyMs: number | null;
    error: string | null;
    errorCategory: string | null;
    checkedAt: string;
  } | null;
  checks: { s: number; l: number | null; t: string; e: string | null }[];
  errorBreakdown: { category: string; count: number }[];
  latencyHistory: { hour: string; avgLatency: number }[];
  transitions: { status: string; at: string }[];
  events: {
    total: number;
    recent: { eventId: string; kind: number; createdAt: number; seenAt: string }[];
  };
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatLatency(ms: number | null): string {
  if (ms === null) return "\u2014";
  return `${ms}ms`;
}

function uptimeColor(pct: number | null): string {
  if (pct === null) return "text-zinc-500";
  if (pct >= 99) return "text-emerald-400";
  if (pct >= 95) return "text-amber-400";
  return "text-red-400";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function durationBetween(a: string, b: string): string {
  const ms = Math.abs(new Date(b).getTime() - new Date(a).getTime());
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

const CATEGORY_LABELS: Record<string, string> = {
  timeout: "Timeout",
  refused: "Connection Refused",
  rate_limit: "Rate Limited",
  auth_required: "Auth Required",
  protocol: "Protocol Error",
  unknown: "Unknown",
  uncategorized: "Uncategorized",
};

export default function RelayDetailPage() {
  const params = useParams();
  const router = useRouter();
  const rawUrl = params.url as string;
  const relayUrl = decodeURIComponent(rawUrl);

  const [data, setData] = useState<RelayDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const hasData = useRef(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/relays/${encodeURIComponent(relayUrl)}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("Relay not found");
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      setData(await res.json());
      hasData.current = true;
      setError(null);
    } catch (err) {
      // Only show blocking error if we have no data yet
      if (!hasData.current) {
        setError(err instanceof Error ? err.message : "Failed to fetch");
      }
    } finally {
      setLoading(false);
    }
  }, [relayUrl]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push("/relays")}
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          &larr; Back to relays
        </button>
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {error ?? "Relay not found"}
        </div>
      </div>
    );
  }

  const isOnline = data.latestCheck?.status === "ok";
  const isBackedOff =
    !!data.relay.backoffUntil && new Date(data.relay.backoffUntil) > new Date();

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "latency", label: "Latency" },
    { key: "errors", label: "Errors" },
    { key: "events", label: "Events" },
  ];

  // Latency stats
  const latencies = data.latencyHistory.map((h) => h.avgLatency);
  const minLatency = latencies.length > 0 ? Math.min(...latencies) : null;
  const maxLatency = latencies.length > 0 ? Math.max(...latencies) : null;
  const avgLatency =
    latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        onClick={() => router.push("/relays")}
        className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        &larr; Back to relays
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                isOnline
                  ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                  : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
              }`}
            />
            <h1 className="text-2xl font-semibold tracking-tight text-white font-mono">
              {hostname(relayUrl)}
            </h1>
            {isBackedOff && (
              <span className="inline-flex items-center rounded-full bg-amber-950/60 px-2.5 py-0.5 text-xs font-medium text-amber-400 ring-1 ring-inset ring-amber-400/20">
                Backed off
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-500 font-mono">{relayUrl}</p>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-6 text-sm">
          <div className="text-right">
            <p className="text-zinc-500 text-xs uppercase tracking-wider">Latency</p>
            <p className="font-mono text-zinc-200 tabular-nums">
              {formatLatency(data.latestCheck?.latencyMs ?? null)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-zinc-500 text-xs uppercase tracking-wider">24h</p>
            <p className={`font-mono tabular-nums ${uptimeColor(data.uptime.last24h)}`}>
              {data.uptime.last24h !== null ? `${data.uptime.last24h}%` : "\u2014"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-zinc-500 text-xs uppercase tracking-wider">7d</p>
            <p className={`font-mono tabular-nums ${uptimeColor(data.uptime.last7d)}`}>
              {data.uptime.last7d !== null ? `${data.uptime.last7d}%` : "\u2014"}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-zinc-800 pb-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Wider UptimeBar */}
          <div className="rounded-lg border border-zinc-800 p-4 space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
              Check History
            </h3>
            <UptimeBar
              checks={data.checks.map((c) => ({ s: c.s, l: c.l }))}
              slots={144}
            />
            <p className="text-xs text-zinc-600">
              {data.uptime.totalChecks} total checks &middot; First seen{" "}
              {new Date(data.relay.firstSeenAt).toLocaleDateString()}
            </p>
          </div>

          {/* Status transitions */}
          <div className="rounded-lg border border-zinc-800 p-4 space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
              Status Timeline
            </h3>
            {data.transitions.length === 0 ? (
              <p className="text-sm text-zinc-600">No status changes recorded</p>
            ) : (
              <div className="space-y-0">
                {data.transitions.map((t, i) => {
                  const nextTransition = data.transitions[i + 1];
                  const duration = nextTransition
                    ? durationBetween(nextTransition.at, t.at)
                    : null;

                  return (
                    <div
                      key={i}
                      className="flex items-start gap-3 py-2 border-l-2 pl-4 -ml-px"
                      style={{
                        borderColor:
                          t.status === "ok"
                            ? "rgb(16 185 129)"
                            : "rgb(239 68 68)",
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-medium ${
                              t.status === "ok"
                                ? "text-emerald-400"
                                : "text-red-400"
                            }`}
                          >
                            {t.status === "ok" ? "Came back online" : "Went down"}
                          </span>
                          {duration && (
                            <span className="text-xs text-zinc-600">
                              for {duration}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500">
                          {formatTime(t.at)} &middot; {timeAgo(t.at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "latency" && (
        <div className="space-y-6">
          {/* Stats cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Min", value: minLatency },
              { label: "Avg", value: avgLatency },
              { label: "Max", value: maxLatency },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-zinc-800 p-4"
              >
                <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
                  {stat.label}
                </p>
                <p className="mt-1 text-xl font-mono tabular-nums text-zinc-200">
                  {stat.value !== null ? `${stat.value}ms` : "\u2014"}
                </p>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="rounded-lg border border-zinc-800 p-4 space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
              Hourly Average Latency (7 days)
            </h3>
            <LatencyChart data={data.latencyHistory} />
          </div>
        </div>
      )}

      {tab === "errors" && (
        <div className="space-y-6">
          {/* Consecutive errors */}
          {data.relay.consecutiveErrors > 0 && (
            <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-sm">
              <span className="text-amber-400 font-medium">
                {data.relay.consecutiveErrors} consecutive error
                {data.relay.consecutiveErrors !== 1 ? "s" : ""}
              </span>
              {isBackedOff && data.relay.backoffUntil && (
                <span className="text-zinc-500">
                  {" "}&middot; backed off until{" "}
                  {new Date(data.relay.backoffUntil).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          )}

          {/* Error breakdown */}
          <div className="rounded-lg border border-zinc-800 p-4 space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
              Error Breakdown (7 days)
            </h3>
            {data.errorBreakdown.length === 0 ? (
              <p className="text-sm text-zinc-600">No errors recorded</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-zinc-500">
                    <th className="pb-2 font-medium">Category</th>
                    <th className="pb-2 font-medium text-right">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {data.errorBreakdown.map((eb) => (
                    <tr key={eb.category}>
                      <td className="py-2 text-zinc-300">
                        {CATEGORY_LABELS[eb.category] ?? eb.category}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-zinc-400">
                        {eb.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Recent errors from checks */}
          <div className="rounded-lg border border-zinc-800 p-4 space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
              Recent Errors
            </h3>
            {(() => {
              const errorChecks = data.checks.filter((c) => c.s === 0);
              if (errorChecks.length === 0) {
                return <p className="text-sm text-zinc-600">No recent errors</p>;
              }
              return (
                <div className="space-y-2">
                  {errorChecks.slice(0, 20).map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm py-1"
                    >
                      <span className="text-zinc-500">
                        {formatTime(c.t)}
                      </span>
                      <span className="text-red-400/80 text-xs font-mono">
                        {c.e ? CATEGORY_LABELS[c.e] ?? c.e : "error"}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {tab === "events" && (
        <div className="space-y-6">
          {/* Total count */}
          <div className="rounded-lg border border-zinc-800 p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
              Total Events
            </p>
            <p className="mt-1 text-2xl font-mono tabular-nums text-zinc-200">
              {data.events.total.toLocaleString()}
            </p>
          </div>

          {/* Recent events */}
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-3 font-medium">Event ID</th>
                  <th className="px-4 py-3 font-medium">Kind</th>
                  <th className="px-4 py-3 font-medium text-right">Created</th>
                  <th className="px-4 py-3 font-medium text-right">Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {data.events.recent.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-zinc-600"
                    >
                      No events from this relay
                    </td>
                  </tr>
                ) : (
                  data.events.recent.map((e) => (
                    <tr
                      key={e.eventId}
                      className="transition-colors hover:bg-zinc-900/50"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">
                        {e.eventId.slice(0, 16)}...
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center rounded bg-zinc-800 px-1.5 py-0.5 text-xs font-mono text-zinc-300">
                          {getKindLabel(e.kind)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-zinc-500">
                        {new Date(e.createdAt * 1000).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-zinc-500">
                        {timeAgo(e.seenAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
