"use client";

import type { HeatmapCell } from "@/lib/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getColor(count: number, max: number): string {
  if (count === 0) return "bg-zinc-800/50";
  const ratio = count / max;
  if (ratio < 0.25) return "bg-emerald-900/60";
  if (ratio < 0.5) return "bg-emerald-700/70";
  if (ratio < 0.75) return "bg-emerald-500/80";
  return "bg-emerald-400";
}

function formatHour(h: number): string {
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

function formatTzLabel(offset: number): string {
  if (offset === 0) return "UTC";
  const sign = offset > 0 ? "+" : "";
  return `UTC${sign}${offset}`;
}

export default function ActivityHeatmap({
  data,
  tzOffset = 0,
}: {
  data: HeatmapCell[];
  tzOffset?: number;
}) {
  const cellMap = new Map<string, number>();
  let max = 0;
  for (const cell of data) {
    const key = `${cell.dayOfWeek}-${cell.hour}`;
    cellMap.set(key, cell.count);
    if (cell.count > max) max = cell.count;
  }

  const tzLabel = formatTzLabel(tzOffset);

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-[600px]">
        {/* Hour labels */}
        <div className="grid grid-cols-[48px_repeat(24,1fr)] gap-[2px] mb-[2px]">
          <div />
          {HOURS.map((h) => (
            <div
              key={h}
              className="text-[9px] text-zinc-500 text-center leading-tight"
            >
              {h % 3 === 0 ? formatHour(h) : ""}
            </div>
          ))}
        </div>
        {/* Grid rows */}
        {DAYS.map((day, dayIdx) => (
          <div
            key={day}
            className="grid grid-cols-[48px_repeat(24,1fr)] gap-[2px] mb-[2px]"
          >
            <div className="text-[11px] text-zinc-400 flex items-center">
              {day}
            </div>
            {HOURS.map((hour) => {
              const count = cellMap.get(`${dayIdx}-${hour}`) ?? 0;
              return (
                <div
                  key={hour}
                  className={`aspect-square rounded-sm ${getColor(count, max)} transition-colors`}
                  title={`${day} ${formatHour(hour)} ${tzLabel}: ${count} event${count !== 1 ? "s" : ""}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
