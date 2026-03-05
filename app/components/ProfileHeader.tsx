import type { TrackedNpubWithStats } from "@/lib/types";

export default function ProfileHeader({
  npubData,
  npub,
  pubkeyHex,
}: {
  npubData: TrackedNpubWithStats | undefined;
  npub: string;
  pubkeyHex: string;
}) {
  const profile = npubData?.profile;
  const displayName = profile?.display_name || profile?.name;

  return (
    <div className="space-y-4">
      {/* Back link */}
      <a href="/npubs" className="text-sm text-zinc-400 hover:text-zinc-200">
        &larr; Back
      </a>

      <div className="flex items-start gap-5">
        {/* Avatar */}
        {profile?.picture ? (
          <img
            src={profile.picture}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full object-cover bg-zinc-800"
          />
        ) : (
          <div className="h-16 w-16 shrink-0 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 text-lg">
            ?
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-1">
          {/* Name */}
          <h1 className="text-xl font-semibold text-white truncate">
            {displayName || (
              <span className="font-mono text-lg">
                {npub.slice(0, 16)}...{npub.slice(-8)}
              </span>
            )}
          </h1>

          {/* nip05 */}
          {profile?.nip05 && (
            <p className="text-sm text-zinc-400 truncate">{profile.nip05}</p>
          )}

          {/* npub + hex identifiers */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-zinc-500">
            <span>
              {npub.slice(0, 16)}...{npub.slice(-8)}
            </span>
            {pubkeyHex && <span>{pubkeyHex.slice(0, 12)}...</span>}
          </div>

          {/* About / bio */}
          {profile?.about && (
            <p className="text-sm text-zinc-300 whitespace-pre-line line-clamp-3 pt-1">
              {profile.about}
            </p>
          )}

          {/* Stats badges */}
          {npubData && (
            <div className="flex flex-wrap gap-2 pt-2">
              <span className="rounded bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-300">
                {npubData.eventCount} events
              </span>
              <span className="rounded bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-300">
                {npubData.cacheCount} cache
              </span>
              {npubData.lastFetchedAt && (
                <span className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-400">
                  Last fetched{" "}
                  {new Date(npubData.lastFetchedAt).toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
