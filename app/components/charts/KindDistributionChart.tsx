"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { getKindLabel } from "@/lib/kind-labels";
import type { KindCount } from "@/lib/types";

const COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a78bfa", // violet-light
  "#34d399", // emerald
  "#fbbf24", // amber
  "#f87171", // red
  "#38bdf8", // sky
  "#fb923c", // orange
  "#a3e635", // lime
  "#e879f9", // fuchsia
];

export default function KindDistributionChart({
  data,
}: {
  data: KindCount[];
}) {
  const chartData = data.map((d) => ({
    name: getKindLabel(d.kind),
    kind: d.kind,
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
          formatter={(value: number | undefined, name: string | undefined) => [value ?? 0, name ?? ""]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
