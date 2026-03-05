"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { getKindLabel } from "@/lib/kind-labels";
import type { AnalyticsData } from "@/lib/types";
import ActivityHeatmap from "./charts/ActivityHeatmap";
import KindDistributionChart from "./charts/KindDistributionChart";
import RelayDistributionChart from "./charts/RelayDistributionChart";
import DailyBoundaryChart from "./charts/DailyBoundaryChart";
import DmActivityChart from "./charts/DmActivityChart";
import RelayTimelineChart from "./charts/RelayTimelineChart";
import AnalyticsFilterBar from "./AnalyticsFilterBar";

export default function AnalyticsTab({ pubkeyHex, npub }: { pubkeyHex: string; npub?: string }) {
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
        {/* External analytics link */}
        {npub && (
          <a
            href={`https://analytics.nostr-wot.com/npub/${npub}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            View on Nostr WoT Analytics
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}

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

        {/* NIP-65 Relay List */}
        {data.nip65Relays.length > 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-2">
              NIP-65 Relay List
            </h3>
            <p className="text-xs text-zinc-500 mb-3">
              Declared relay list from kind 10002
            </p>
            {data.relayHealth && data.relayHealth.issues.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                {data.relayHealth.issues.length} issue{data.relayHealth.issues.length > 1 ? "s" : ""} — see Relay Health tab
              </span>
            )}
            <div className="flex flex-wrap gap-2">
              {data.nip65Relays.map((relay) => {
                let host: string;
                try { host = new URL(relay.url).hostname; } catch { host = relay.url; }
                const healthColor = {
                  active: "bg-emerald-400",
                  reachable: "bg-amber-400",
                  unreachable: "bg-red-400",
                  unknown: "bg-zinc-500",
                }[relay.health];
                const healthTitle = {
                  active: "Active — has events",
                  reachable: "Reachable — no events for this user",
                  unreachable: "Unreachable — connection failed",
                  unknown: "Unknown — no data",
                }[relay.health];
                const markerLabel = relay.marker === "read" ? "R" : relay.marker === "write" ? "W" : "R/W";
                const markerColor = relay.marker === "read"
                  ? "text-blue-400"
                  : relay.marker === "write"
                    ? "text-orange-400"
                    : "text-zinc-400";
                return (
                  <span
                    key={relay.url}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700"
                    title={`${relay.url}\n${healthTitle}\n${relay.eventPercent}% of events`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${healthColor}`} />
                    <span className={`${markerColor} font-semibold text-[10px]`}>{markerLabel}</span>
                    {host}
                    {relay.eventPercent > 0 && (
                      <span className="text-zinc-500 text-[10px]">{relay.eventPercent}%</span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Loading overlay for filter changes */}
        {loading && (
          <p className="text-xs text-zinc-500 animate-pulse">Updating...</p>
        )}

        {/* Heatmap full width */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-3">
            Activity Heatmap
          </h3>
          <ActivityHeatmap data={data.heatmap} tzOffset={tzOffset} />
        </div>

        {/* Distribution charts: kinds + relays */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">
              Event Type Distribution
            </h3>
            <KindDistributionChart data={data.kindDistribution} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
              {data.kindDistribution.slice(0, 6).map((k) => (
                <span key={k.kind} className="text-[10px] text-zinc-400">
                  {getKindLabel(k.kind)}: {k.count}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">
              Relay Distribution
            </h3>
            <RelayDistributionChart data={data.relayDistribution} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
              {data.relayDistribution.slice(0, 6).map((r) => {
                let host: string;
                try { host = new URL(r.relay).hostname.replace(/^relay\./, ""); } catch { host = r.relay; }
                return (
                  <span key={r.relay} className="text-[10px] text-zinc-400">
                    {host}: {r.count}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Relay timeline: events per relay over time */}
        {data.relayTimeline.length > 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">
              Events per Relay Over Time
            </h3>
            <p className="text-xs text-zinc-500 mb-3">
              Monthly event counts by relay — gaps reveal pruning
            </p>
            <RelayTimelineChart data={data.relayTimeline} outboxRelays={data.nip65Relays.filter((r) => r.marker !== "read").map((r) => r.url)} />
          </div>
        )}

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

        {/* When to Contact — DM activity */}
        {data.dmAnalytics && data.dmAnalytics.totalDmCount > 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">
              When to Contact
            </h3>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex flex-wrap gap-2">
                {data.dmAnalytics.peakHours.map((h) => {
                  let localH = (h + tzOffset) % 24;
                  if (localH < 0) localH += 24;
                  const period = localH >= 12 ? "PM" : "AM";
                  const display = localH === 0 ? 12 : localH > 12 ? localH - 12 : localH;
                  return (
                    <span
                      key={h}
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    >
                      {display}:00 {period}
                    </span>
                  );
                })}
                <span className="text-xs text-zinc-500">Best hours</span>
              </div>
              <div className="flex items-center gap-4 ml-auto text-xs text-zinc-400">
                <span>{data.dmAnalytics.totalDmCount.toLocaleString()} DMs</span>
                <span>{(data.dmAnalytics.responsivenessScore * 100).toFixed(1)}% of activity</span>
              </div>
            </div>
            <DmActivityChart
              data={data.dmAnalytics.hourlyDistribution}
              peakHours={data.dmAnalytics.peakHours}
              tzOffset={tzOffset}
            />
          </div>
        )}
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
        outboxRelays={data.nip65Relays.filter((r) => r.marker !== "read").map((r) => r.url)}
      />
    </div>
  );
}
