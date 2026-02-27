"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { DailyBoundary } from "@/lib/types";

function formatHourLabel(h: number): string {
  const hour = Math.floor(h);
  const min = Math.round((h - hour) * 60);
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return min > 0 ? `${displayHour}:${String(min).padStart(2, "0")} ${period}` : `${displayHour} ${period}`;
}

function formatTzLabel(offset: number): string {
  if (offset === 0) return "UTC";
  const sign = offset > 0 ? "+" : "";
  return `UTC${sign}${offset}`;
}

export default function DailyBoundaryChart({
  data,
  tzOffset = 0,
}: {
  data: DailyBoundary[];
  tzOffset?: number;
}) {
  const chartData = data.map((d) => ({
    date: d.date,
    firstHour: d.firstHour,
    lastHour: d.lastHour,
  }));

  const tzLabel = formatTzLabel(tzOffset);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#71717a" }}
          tickFormatter={(d: string) => d.slice(5)}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[0, 24]}
          ticks={[0, 6, 12, 18, 24]}
          tickFormatter={formatHourLabel}
          tick={{ fontSize: 10, fill: "#71717a" }}
          width={50}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#27272a",
            border: "1px solid #3f3f46",
            borderRadius: "8px",
            fontSize: "12px",
            color: "#d4d4d8",
          }}
          formatter={(value: number | undefined, name: string | undefined) => [
            `${formatHourLabel(value ?? 0)} ${tzLabel}`,
            name === "firstHour" ? "First event" : "Last event",
          ]}
          labelFormatter={(label: unknown) => `Date: ${label}`}
        />
        <Area
          type="monotone"
          dataKey="firstHour"
          stroke="#34d399"
          fill="#34d399"
          fillOpacity={0.15}
          name="firstHour"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="lastHour"
          stroke="#6366f1"
          fill="#6366f1"
          fillOpacity={0.15}
          name="lastHour"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
