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

interface LatencyPoint {
  hour: string;
  avgLatency: number;
}

export default function LatencyChart({ data }: { data: LatencyPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-zinc-500">
        No latency data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
        <XAxis
          dataKey="hour"
          tick={{ fontSize: 10, fill: "#71717a" }}
          tickFormatter={(h: string) => {
            const d = new Date(h);
            return `${(d.getMonth() + 1)}/${d.getDate()} ${d.getHours()}h`;
          }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#71717a" }}
          width={45}
          tickFormatter={(v: number) => `${v}ms`}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const val = payload[0]?.value;
            const d = new Date(String(label));
            const dateStr = d.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            });
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
                <p style={{ marginBottom: 4, color: "#a1a1aa" }}>{dateStr}</p>
                <p>
                  <span style={{ color: "#34d399" }}>Avg: </span>
                  {val}ms
                </p>
              </div>
            );
          }}
        />
        <defs>
          <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="avgLatency"
          stroke="#34d399"
          strokeWidth={1.5}
          fill="url(#latencyGradient)"
          dot={false}
          activeDot={{ r: 3, fill: "#34d399" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
