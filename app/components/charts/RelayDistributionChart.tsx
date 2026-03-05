"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { RelayCount } from "@/lib/types";

const COLORS = [
  "#38bdf8", // sky
  "#6366f1", // indigo
  "#34d399", // emerald
  "#fbbf24", // amber
  "#f87171", // red
  "#8b5cf6", // violet
  "#fb923c", // orange
  "#a3e635", // lime
  "#e879f9", // fuchsia
  "#a78bfa", // violet-light
];

function shortenRelay(url: string): string {
  try {
    return new URL(url).hostname.replace(/^relay\./, "");
  } catch {
    return url;
  }
}

export default function RelayDistributionChart({
  data,
}: {
  data: RelayCount[];
}) {
  const chartData = data.map((d) => ({
    name: shortenRelay(d.relay),
    fullUrl: d.relay,
    value: d.count,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
          stroke="none"
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "#27272a",
            border: "1px solid #3f3f46",
            borderRadius: "8px",
            fontSize: "12px",
            color: "#d4d4d8",
          }}
          formatter={(value: number | undefined, name: string | undefined) => [
            value ?? 0,
            name ?? "",
          ]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
