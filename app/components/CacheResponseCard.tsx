"use client";

import type { StoredCacheResponse } from "@/lib/types";

export default function CacheResponseCard({
  response,
}: {
  response: StoredCacheResponse;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="rounded bg-emerald-900/50 px-2 py-0.5 text-xs font-medium text-emerald-300">
          {response.queryType}
        </span>
        <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
          kind {response.responseKind}
        </span>
        <span className="text-xs text-zinc-500">
          {new Date(response.fetchedAt).toLocaleString()}
        </span>
      </div>
      <details>
        <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
          View content
        </summary>
        <pre className="mt-1 rounded bg-zinc-800 p-2 text-xs text-zinc-400 overflow-x-auto max-h-96">
          {JSON.stringify(response.content, null, 2)}
        </pre>
      </details>
    </div>
  );
}
