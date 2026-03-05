"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { DmHourlyActivity } from "@/lib/types";

interface Props {
  data: DmHourlyActivity[];
  peakHours: number[];
  tzOffset: number;
}

export default function DmActivityChart({ data, peakHours, tzOffset }: Props) {
  // Shift hours by timezone offset for display
  const shifted = data.map((d) => {
    let localHour = (d.hour + tzOffset) % 24;
    if (localHour < 0) localHour += 24;
    return { hour: localHour, count: d.count, utcHour: d.hour };
  });

  // Sort by local hour for display
  shifted.sort((a, b) => a.hour - b.hour);

  const peakSet = new Set(peakHours);

  const formatHour = (h: number) => {
    const period = h >= 12 ? "PM" : "AM";
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${display}${period}`;
  };

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={shifted} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
        <XAxis
          dataKey="hour"
          tickFormatter={formatHour}
          tick={{ fontSize: 10, fill: "#a1a1aa" }}
          axisLine={{ stroke: "#3f3f46" }}
          tickLine={false}
          interval={2}
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
          formatter={(value: number | undefined) => [value ?? 0, "DMs"]}
          labelFormatter={(h) => `${formatHour(Number(h))} (local)`}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {shifted.map((entry) => (
            <Cell
              key={entry.hour}
              fill={peakSet.has(entry.utcHour) ? "#fbbf24" : "#6366f1"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
