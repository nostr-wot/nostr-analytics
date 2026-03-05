"use client";

import type { TrackedNpubWithStats } from "@/lib/types";

export default function NpubTable({
  npubs,
  selected,
  loading,
  fetching,
  isAdmin,
  onToggleSelect,
  onToggleAll,
  onRemove,
  onFetchOne,
}: {
  npubs: TrackedNpubWithStats[];
  selected: Set<string>;
  loading: boolean;
  fetching: boolean;
  isAdmin: boolean;
  onToggleSelect: (npub: string) => void;
  onToggleAll: () => void;
  onRemove: () => void;
  onFetchOne: (pubkeyHex: string) => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Tracked npubs ({npubs.length})
        </h2>
        {isAdmin && selected.size > 0 && (
          <button
            onClick={onRemove}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            Remove {selected.size} selected
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : npubs.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No npubs tracked yet. Add some above.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400">
                {isAdmin && (
                  <th className="pb-3 pr-4">
                    <input
                      type="checkbox"
                      checked={selected.size === npubs.length}
                      onChange={onToggleAll}
                      className="rounded border-zinc-600"
                    />
                  </th>
                )}
                <th className="pb-3 pr-4">Profile</th>
                <th className="pb-3 pr-4">Events</th>
                <th className="pb-3 pr-4">Cache</th>
                <th className="pb-3 pr-4">Last Fetched</th>
                {isAdmin && <th className="pb-3">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {npubs.map((n) => (
                <tr
                  key={n.npub}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                >
                  {isAdmin && (
                    <td className="py-3 pr-4">
                      <input
                        type="checkbox"
                        checked={selected.has(n.npub)}
                        onChange={() => onToggleSelect(n.npub)}
                        className="rounded border-zinc-600"
                      />
                    </td>
                  )}
                  <td className="py-3 pr-4">
                    <a
                      href={`/npubs/${n.npub}`}
                      className="flex items-center gap-3 group"
                    >
                      {n.profile?.picture ? (
                        <img
                          src={n.profile.picture}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded-full object-cover bg-zinc-800"
                        />
                      ) : (
                        <div className="h-9 w-9 shrink-0 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 text-xs">
                          ?
                        </div>
                      )}
                      <div className="min-w-0">
                        {n.profile?.display_name || n.profile?.name ? (
                          <>
                            <div className="text-sm font-medium text-zinc-100 group-hover:text-blue-300 truncate">
                              {n.profile.display_name || n.profile.name}
                            </div>
                            {n.profile?.nip05 && (
                              <div className="text-xs text-zinc-500 truncate">
                                {n.profile.nip05}
                              </div>
                            )}
                            <div className="font-mono text-[11px] text-zinc-600 truncate">
                              {n.npub.slice(0, 12)}...{n.npub.slice(-6)}
                            </div>
                          </>
                        ) : (
                          <div className="font-mono text-sm text-blue-400 group-hover:text-blue-300 truncate">
                            {n.npub.slice(0, 12)}...{n.npub.slice(-6)}
                          </div>
                        )}
                      </div>
                    </a>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="rounded bg-zinc-800 px-2 py-1 text-xs font-medium">
                      {n.eventCount}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="rounded bg-zinc-800 px-2 py-1 text-xs font-medium">
                      {n.cacheCount}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-zinc-400">
                    {n.lastFetchedAt
                      ? new Date(n.lastFetchedAt).toLocaleString()
                      : "Never"}
                  </td>
                  {isAdmin && (
                    <td className="py-3">
                      <button
                        onClick={() => onFetchOne(n.pubkeyHex)}
                        disabled={fetching}
                        className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                      >
                        Fetch now
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
