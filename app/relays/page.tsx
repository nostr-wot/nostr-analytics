"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import UptimeBar from "../components/UptimeBar";

interface CompactCheck {
  s: number; // 1 = ok, 0 = error
  l: number | null; // latencyMs
}

interface RelayData {
  relay: string;
  status: string;
  latencyMs: number | null;
  error: string | null;
  lastChecked: string | null;
  uptime24h: number | null;
  uptime7d: number | null;
  totalEvents: number;
  checks: CompactCheck[];
  consecutiveErrors: number;
  backoffUntil: string | null;
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

function isBackedOff(relay: RelayData): boolean {
  return !!relay.backoffUntil && new Date(relay.backoffUntil) > new Date();
}

function latencyColor(ms: number | null): string {
  if (ms === null) return "text-zinc-500";
  if (ms < 200) return "text-emerald-400";
  if (ms < 500) return "text-amber-400";
  return "text-red-400";
}

function uptimeColor(pct: number | null): string {
  if (pct === null) return "text-zinc-500";
  if (pct >= 99) return "text-emerald-400";
  if (pct >= 95) return "text-amber-400";
  return "text-red-400";
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

export default function RelaysPage() {
  const router = useRouter();
  const [relays, setRelays] = useState<RelayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasData = useRef(false);

  useEffect(() => {
    async function fetchRelays() {
      try {
        const res = await fetch("/api/relays");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setRelays(await res.json());
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
    }
    fetchRelays();
    const interval = setInterval(fetchRelays, 30_000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onlineCount = relays.filter((r) => r.status === "ok").length;
  const totalCount = relays.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Relay Status
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Health monitoring across {totalCount} endpoints
          </p>
        </div>
        {!loading && (
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
              <span className="text-zinc-400 tabular-nums">
                {onlineCount} online
              </span>
            </div>
            {totalCount - onlineCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
                <span className="text-zinc-400 tabular-nums">
                  {totalCount - onlineCount} down
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Table */}
      {!loading && relays.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium">Relay</th>
                <th className="px-4 py-3 font-medium text-right">Latency</th>
                <th className="px-4 py-3 font-medium">
                  <span title="Last 24 hours of checks">24h Uptime</span>
                </th>
                <th className="px-4 py-3 font-medium text-right">7d</th>
                <th className="px-4 py-3 font-medium text-right">Events</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {relays.map((relay) => (
                <tr
                  key={relay.relay}
                  className="transition-colors hover:bg-zinc-900/50 cursor-pointer"
                  onClick={() => router.push(`/relays/${encodeURIComponent(relay.relay)}`)}
                >
                  {/* Relay name + status */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                          relay.status === "ok"
                            ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                            : relay.status === "error"
                              ? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]"
                              : "bg-zinc-600"
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-zinc-200">
                            {hostname(relay.relay)}
                          </span>
                          {isBackedOff(relay) && (
                            <span className="inline-flex items-center rounded-full bg-amber-950/60 px-2 py-0.5 text-[10px] font-medium text-amber-400 ring-1 ring-inset ring-amber-400/20">
                              Backed off
                            </span>
                          )}
                        </div>
                        {relay.error && (
                          <p className="mt-0.5 truncate text-xs text-red-400/80">
                            {relay.error}
                          </p>
                        )}
                        {relay.lastChecked && (
                          <p className="mt-0.5 text-xs text-zinc-600">
                            {timeAgo(relay.lastChecked)}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Latency */}
                  <td
                    className={`px-4 py-3 text-right font-mono tabular-nums ${latencyColor(relay.latencyMs)}`}
                  >
                    {formatLatency(relay.latencyMs)}
                  </td>

                  {/* 24h uptime bar */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-full max-w-[200px]">
                        <UptimeBar checks={relay.checks} />
                      </div>
                      <span
                        className={`shrink-0 font-mono text-xs tabular-nums ${uptimeColor(relay.uptime24h)}`}
                      >
                        {relay.uptime24h !== null
                          ? `${relay.uptime24h}%`
                          : "\u2014"}
                      </span>
                    </div>
                  </td>

                  {/* 7d uptime */}
                  <td
                    className={`px-4 py-3 text-right font-mono tabular-nums ${uptimeColor(relay.uptime7d)}`}
                  >
                    {relay.uptime7d !== null ? `${relay.uptime7d}%` : "\u2014"}
                  </td>

                  {/* Event count */}
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-400">
                    {relay.totalEvents.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
