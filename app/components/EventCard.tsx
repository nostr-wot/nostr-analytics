"use client";

import { getKindLabel } from "@/lib/kind-labels";
import { CONTENT_TRUNCATE_LENGTH } from "@/lib/constants";
import type { StoredNostrEvent } from "@/lib/types";

export default function EventCard({
  event,
  expanded,
  onToggleExpand,
}: {
  event: StoredNostrEvent;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const formatTime = (ts: number) => new Date(ts * 1000).toLocaleString();

  const truncated =
    event.content.length > CONTENT_TRUNCATE_LENGTH
      ? event.content.slice(0, CONTENT_TRUNCATE_LENGTH) + "..."
      : event.content;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="rounded bg-violet-900/50 px-2 py-0.5 text-xs font-medium text-violet-300">
              {getKindLabel(event.kind)}
            </span>
            <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
              {event.source}
            </span>
            <span className="text-xs text-zinc-500">
              {formatTime(event.createdAt)}
            </span>
          </div>
          <p className="font-mono text-xs text-zinc-300 break-all">
            {expanded ? event.content : truncated}
          </p>
          {event.content.length > CONTENT_TRUNCATE_LENGTH && (
            <button
              onClick={onToggleExpand}
              className="mt-1 text-xs text-blue-400 hover:text-blue-300"
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          )}
          {event.tags.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
                Tags ({event.tags.length})
              </summary>
              <pre className="mt-1 rounded bg-zinc-800 p-2 text-xs text-zinc-400 overflow-x-auto">
                {JSON.stringify(event.tags, null, 2)}
              </pre>
            </details>
          )}
        </div>
        <span className="shrink-0 font-mono text-[10px] text-zinc-600">
          {event.eventId.slice(0, 8)}
        </span>
      </div>
    </div>
  );
}
