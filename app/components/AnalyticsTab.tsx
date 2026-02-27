"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { getKindLabel } from "@/lib/kind-labels";
import type { AnalyticsData } from "@/lib/types";
import ActivityHeatmap from "./charts/ActivityHeatmap";
import KindDistributionChart from "./charts/KindDistributionChart";
import DailyBoundaryChart from "./charts/DailyBoundaryChart";
import AnalyticsFilterBar from "./AnalyticsFilterBar";

export default function AnalyticsTab({ pubkeyHex }: { pubkeyHex: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedKinds, setSelectedKinds] = useState<Set<number>>(new Set());
  const [selectedRelays, setSelectedRelays] = useState<Set<string>>(new Set());
  const [tzOffset, setTzOffset] = useState(0);
  const [suggestedTz, setSuggestedTz] = useState(0);
  const initialFetchDone = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAnalytics = useCallback(
    (tz: number, kinds: Set<number>, relays: Set<string>) => {
      if (!pubkeyHex) return;
      const params = new URLSearchParams({ pubkey: pubkeyHex, tz: String(tz) });
      if (kinds.size > 0) {
        params.set("kinds", Array.from(kinds).join(","));
      }
      if (relays.size > 0) {
        params.set("relays", Array.from(relays).join(","));
      }
      setLoading(true);
      fetch(`/api/events/analytics?${params}`)
        .then((res) => res.json())
        .then((d: AnalyticsData) => {
          setData(d);
          setLoading(false);
        });
    },
    [pubkeyHex]
  );

  // Initial fetch at tz=0 to get suggested timezone
  useEffect(() => {
    if (!pubkeyHex || initialFetchDone.current) return;
    initialFetchDone.current = true;
    fetch(`/api/events/analytics?pubkey=${pubkeyHex}&tz=0`)
      .then((res) => res.json())
      .then((d: AnalyticsData) => {
        setSuggestedTz(d.suggestedTimezoneOffset);
        setTzOffset(d.suggestedTimezoneOffset);
        if (d.suggestedTimezoneOffset !== 0) {
          fetchAnalytics(d.suggestedTimezoneOffset, selectedKinds, selectedRelays);
        } else {
          setData(d);
          setLoading(false);
        }
      });
  }, [pubkeyHex, fetchAnalytics, selectedKinds, selectedRelays]);

  // Debounced re-fetch on tz, kind, or relay changes (skip initial)
  const prevTz = useRef(tzOffset);
  const prevKinds = useRef(selectedKinds);
  const prevRelays = useRef(selectedRelays);
  useEffect(() => {
    if (!initialFetchDone.current) return;
    if (
      prevTz.current === tzOffset &&
      prevKinds.current === selectedKinds &&
      prevRelays.current === selectedRelays
    )
      return;
    prevTz.current = tzOffset;
    prevKinds.current = selectedKinds;
    prevRelays.current = selectedRelays;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchAnalytics(tzOffset, selectedKinds, selectedRelays);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [tzOffset, selectedKinds, selectedRelays, fetchAnalytics]);

  const handleToggleKind = useCallback((kind: number) => {
    setSelectedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  }, []);

  const handleToggleRelay = useCallback((relay: string) => {
    setSelectedRelays((prev) => {
      const next = new Set(prev);
      if (next.has(relay)) {
        next.delete(relay);
      } else {
        next.add(relay);
      }
      return next;
    });
  }, []);

  if (loading && !data) {
    return <p className="text-sm text-zinc-500">Loading analytics...</p>;
  }

  if (!data || data.totalEvents === 0) {
    return <p className="text-sm text-zinc-500">No event data for analytics.</p>;
  }

  const earliest = new Date(data.dateRange.earliest * 1000).toLocaleDateString();
  const latest = new Date(data.dateRange.latest * 1000).toLocaleDateString();

  // Top kind for summary
  const topKind = data.kindDistribution[0];

  return (
    <div className="pb-36">
      <div className="space-y-6">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs text-zinc-500 mb-1">Total Events</p>
            <p className="text-2xl font-semibold text-zinc-100">
              {data.totalEvents.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs text-zinc-500 mb-1">Event Types</p>
            <p className="text-2xl font-semibold text-zinc-100">
              {data.kindDistribution.length}
            </p>
            {topKind && (
              <p className="text-xs text-zinc-500 mt-1">
                Most common: {getKindLabel(topKind.kind)}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs text-zinc-500 mb-1">Date Range</p>
            <p className="text-sm font-medium text-zinc-100">{earliest}</p>
            <p className="text-xs text-zinc-500">to {latest}</p>
          </div>
        </div>

        {/* Loading overlay for filter changes */}
        {loading && (
          <p className="text-xs text-zinc-500 animate-pulse">Updating...</p>
        )}

        {/* Charts row: heatmap + donut */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">
              Activity Heatmap
            </h3>
            <ActivityHeatmap data={data.heatmap} tzOffset={tzOffset} />
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">
              Event Type Distribution
            </h3>
            <KindDistributionChart data={data.kindDistribution} />
            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
              {data.kindDistribution.slice(0, 6).map((k) => (
                <span key={k.kind} className="text-[10px] text-zinc-400">
                  {getKindLabel(k.kind)}: {k.count}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Daily boundary chart full width */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-3">
            Daily Activity Window
          </h3>
          <p className="text-xs text-zinc-500 mb-3">
            First and last event times per day
          </p>
          <DailyBoundaryChart data={data.dailyBoundaries} tzOffset={tzOffset} />
        </div>
      </div>

      <AnalyticsFilterBar
        kindDistribution={data.kindDistribution}
        selectedKinds={selectedKinds}
        onToggleKind={handleToggleKind}
        relayDistribution={data.relayDistribution}
        selectedRelays={selectedRelays}
        onToggleRelay={handleToggleRelay}
        tzOffset={tzOffset}
        onTzChange={setTzOffset}
        suggestedTz={suggestedTz}
      />
    </div>
  );
}
