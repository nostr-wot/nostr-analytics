"use client";

import { getKindLabel } from "@/lib/kind-labels";
import type { KindCount, RelayCount } from "@/lib/types";
import MultiSelectPills from "./MultiSelectPills";

function formatOffset(offset: number): string {
  const sign = offset >= 0 ? "+" : "";
  return `UTC${sign}${offset}`;
}

function shortenRelay(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function AnalyticsFilterBar({
  kindDistribution,
  selectedKinds,
  onToggleKind,
  relayDistribution,
  selectedRelays,
  onToggleRelay,
  tzOffset,
  onTzChange,
  suggestedTz,
}: {
  kindDistribution: KindCount[];
  selectedKinds: Set<number>;
  onToggleKind: (kind: number) => void;
  relayDistribution: RelayCount[];
  selectedRelays: Set<string>;
  onToggleRelay: (relay: string) => void;
  tzOffset: number;
  onTzChange: (offset: number) => void;
  suggestedTz: number;
}) {
  const kindPills = kindDistribution.map((k) => ({
    key: String(k.kind),
    label: getKindLabel(k.kind),
    count: k.count,
  }));

  const selectedKindKeys = new Set(
    Array.from(selectedKinds).map((k) => String(k))
  );

  const relayPills = relayDistribution.map((r) => ({
    key: r.relay,
    label: shortenRelay(r.relay),
    count: r.count,
  }));

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 py-3 space-y-2">
        {/* Kind pills row */}
        <div className="flex items-start gap-2">
          <span className="text-[11px] text-zinc-500 font-medium pt-0.5 shrink-0">
            Kinds:
          </span>
          <MultiSelectPills
            items={kindPills}
            selected={selectedKindKeys}
            onToggle={(key) => onToggleKind(Number(key))}
          />
        </div>

        {/* Relay pills row */}
        <div className="flex items-start gap-2">
          <span className="text-[11px] text-zinc-500 font-medium pt-0.5 shrink-0">
            Relays:
          </span>
          <MultiSelectPills
            items={relayPills}
            selected={selectedRelays}
            onToggle={onToggleRelay}
          />
        </div>

        {/* Timezone slider row */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-zinc-500 font-medium shrink-0">
            Timezone:
          </span>
          <input
            type="range"
            min={-12}
            max={14}
            step={1}
            value={tzOffset}
            onChange={(e) => onTzChange(Number(e.target.value))}
            className="flex-1 max-w-xs h-1 accent-blue-500 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
          />
          <span className="text-xs text-zinc-300 font-mono w-16">
            {formatOffset(tzOffset)}
          </span>
          {suggestedTz !== tzOffset && (
            <button
              onClick={() => onTzChange(suggestedTz)}
              className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
            >
              guess: {formatOffset(suggestedTz)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
