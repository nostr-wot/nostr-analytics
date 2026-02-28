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
  // Wrap hours > 24 back to 12-hour display (e.g. 26 → 2 AM)
  const wrapped = h % 24;
  const hour = Math.floor(wrapped);
  const min = Math.round((wrapped - hour) * 60);
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return min > 0
    ? `${displayHour}:${String(min).padStart(2, "0")} ${period}`
    : `${displayHour} ${period}`;
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
  // If lastHour < firstHour, user was active past midnight — push lastHour past 24
  const chartData = data.map((d) => {
    const last = d.lastHour < d.firstHour ? d.lastHour + 24 : d.lastHour;
    return {
      date: d.date,
      firstHour: d.firstHour,
      lastHour: last,
      // For stacked area: invisible base + visible band
      base: d.firstHour,
      band: last - d.firstHour,
    };
  });

  const maxHour = Math.max(24, ...chartData.map((d) => d.lastHour));
  const yMax = Math.min(Math.ceil(maxHour / 6) * 6, 30); // snap to 6h grid, cap at 30

  const ticks = [0, 6, 12, 18, 24];
  if (yMax > 24) ticks.push(yMax);

  const tzLabel = formatTzLabel(tzOffset);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={chartData} stackOffset="none">
        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#71717a" }}
          tickFormatter={(d: string) => d.slice(5)}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[0, yMax]}
          ticks={ticks}
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
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload;
            if (!d) return null;
            return (
              <div
                style={{
                  backgroundColor: "#27272a",
                  border: "1px solid #3f3f46",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  fontSize: "12px",
                  color: "#d4d4d8",
                }}
              >
                <p style={{ marginBottom: 4, color: "#a1a1aa" }}>{label}</p>
                <p>
                  <span style={{ color: "#34d399" }}>First: </span>
                  {formatHourLabel(d.firstHour)} {tzLabel}
                </p>
                <p>
                  <span style={{ color: "#818cf8" }}>Last: </span>
                  {formatHourLabel(d.lastHour)} {tzLabel}
                  {d.lastHour > 24 && (
                    <span style={{ color: "#71717a" }}> (next day)</span>
                  )}
                </p>
              </div>
            );
          }}
        />
        {/* Invisible base area — pushes the band up to firstHour */}
        <Area
          type="monotone"
          dataKey="base"
          stackId="range"
          stroke="none"
          fill="transparent"
          dot={false}
          activeDot={false}
        />
        {/* Visible band — fills from firstHour to lastHour */}
        <Area
          type="monotone"
          dataKey="band"
          stackId="range"
          stroke="none"
          fill="url(#bandGradient)"
          fillOpacity={1}
          dot={false}
          activeDot={false}
        />
        {/* Line overlays for first and last */}
        <Area
          type="monotone"
          dataKey="firstHour"
          stroke="#34d399"
          strokeWidth={1.5}
          fill="none"
          dot={false}
          activeDot={{ r: 3, fill: "#34d399" }}
        />
        <Area
          type="monotone"
          dataKey="lastHour"
          stroke="#818cf8"
          strokeWidth={1.5}
          fill="none"
          dot={false}
          activeDot={{ r: 3, fill: "#818cf8" }}
        />
        <defs>
          <linearGradient id="bandGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#818cf8" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0.25} />
          </linearGradient>
        </defs>
      </AreaChart>
    </ResponsiveContainer>
  );
}
