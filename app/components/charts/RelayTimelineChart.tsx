"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { RelayMonthCount } from "@/lib/types";

const COLORS = [
  "#38bdf8", "#6366f1", "#34d399", "#fbbf24", "#f87171",
  "#8b5cf6", "#fb923c", "#a3e635", "#e879f9", "#a78bfa",
];

function shortenRelay(url: string): string {
  try {
    return new URL(url).hostname.replace(/^relay\./, "");
  } catch {
    return url;
  }
}

export default function RelayTimelineChart({
  data,
  outboxRelays,
}: {
  data: RelayMonthCount[];
  outboxRelays?: string[];
}) {
  const [showOutboxOnly, setShowOutboxOnly] = useState(false);
  const outboxSet = outboxRelays ? new Set(outboxRelays) : new Set<string>();

  // Filter data if outbox-only mode
  const filtered = showOutboxOnly
    ? data.filter((d) => outboxSet.has(d.relay))
    : data;

  // Get unique relays
  const relays = [...new Set(filtered.map((d) => d.relay))];

  // Pivot into { month, [relay]: count } rows
  const byMonth = new Map<string, Record<string, number>>();
  for (const d of filtered) {
    if (!byMonth.has(d.month)) byMonth.set(d.month, { month: 0 } as never);
    const row = byMonth.get(d.month)!;
    (row as Record<string, string | number>).month = d.month;
    (row as Record<string, number>)[d.relay] = d.count;
  }
  const chartData = [...byMonth.values()];

  return (
    <div>
      {outboxRelays && outboxRelays.length > 0 && (
        <div className="flex gap-1 mb-3">
          <button
            onClick={() => setShowOutboxOnly(false)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
              !showOutboxOnly
                ? "bg-blue-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setShowOutboxOnly(true)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
              showOutboxOnly
                ? "bg-emerald-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            Outbox
          </button>
        </div>
      )}
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
        <XAxis
          dataKey="month"
          tick={{ fontSize: 10, fill: "#a1a1aa" }}
          axisLine={{ stroke: "#3f3f46" }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#a1a1aa" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#27272a",
            border: "1px solid #3f3f46",
            borderRadius: "8px",
            fontSize: "12px",
            color: "#d4d4d8",
          }}
          labelFormatter={(label) => `Month: ${label}`}
          formatter={(value: number | undefined, name: string | undefined) => [
            value ?? 0,
            name ? shortenRelay(name) : "",
          ]}
        />
        {relays.map((relay, i) => (
          <Area
            key={relay}
            type="monotone"
            dataKey={relay}
            stackId="events"
            stroke={COLORS[i % COLORS.length]}
            fill={COLORS[i % COLORS.length]}
            fillOpacity={0.6}
            name={relay}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
    </div>
  );
}
