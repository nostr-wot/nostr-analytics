"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { getKindLabel } from "@/lib/kind-labels";
import { CACHE_QUERY_TYPES } from "@/lib/constants";
import { useNpubCache } from "@/lib/npub-cache";
import type {
  StoredNostrEvent,
  StoredCacheResponse,
  KindCount,
  DetailTab,
} from "@/lib/types";
import FilterPills from "../../components/FilterPills";
import Pagination from "../../components/Pagination";
import EventCard from "../../components/EventCard";
import CacheResponseCard from "../../components/CacheResponseCard";
import ProfileHeader from "../../components/ProfileHeader";
import AnalyticsTab from "../../components/AnalyticsTab";

export default function NpubDetailPage() {
  const params = useParams();
  const npub = params.npub as string;
  const { getByNpub } = useNpubCache();
  const npubData = getByNpub(npub);
  const pubkeyHex = npubData?.pubkeyHex ?? "";

  const [tab, setTab] = useState<DetailTab>("events");
  const [kinds, setKinds] = useState<KindCount[]>([]);
  const [selectedKind, setSelectedKind] = useState<number | null>(null);
  const [events, setEvents] = useState<StoredNostrEvent[]>([]);
  const [cacheResponses, setCacheResponses] = useState<StoredCacheResponse[]>(
    []
  );
  const [cacheQueryType, setCacheQueryType] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
  };

  const fetchKinds = useCallback(async () => {
    if (!pubkeyHex) return;
    const res = await fetch(`/api/events/kinds?pubkey=${pubkeyHex}`);
    const data = await res.json();
    setKinds(data);
  }, [pubkeyHex]);

  const fetchEvents = useCallback(async () => {
    if (!pubkeyHex) return;
    setLoading(true);
    const kindParam =
      selectedKind !== null ? `&kind=${selectedKind}` : "";
    const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
    const res = await fetch(
      `/api/events?pubkey=${pubkeyHex}${kindParam}${searchParam}&page=${page}&limit=30`
    );
    const data = await res.json();
    setEvents(data.events);
    setTotalPages(data.totalPages);
    setTotal(data.total);
    setLoading(false);
  }, [pubkeyHex, selectedKind, search, page]);

  const fetchCache = useCallback(async () => {
    if (!pubkeyHex) return;
    setLoading(true);
    const qtParam = cacheQueryType ? `&queryType=${cacheQueryType}` : "";
    const res = await fetch(
      `/api/events/cache?pubkey=${pubkeyHex}${qtParam}&page=${page}&limit=30`
    );
    const data = await res.json();
    setCacheResponses(data.responses);
    setTotalPages(data.totalPages);
    setTotal(data.total);
    setLoading(false);
  }, [pubkeyHex, cacheQueryType, page]);

  useEffect(() => {
    fetchKinds();
  }, [fetchKinds]);

  useEffect(() => {
    if (tab === "events") fetchEvents();
    else fetchCache();
  }, [tab, fetchEvents, fetchCache]);

  const kindPills = kinds.map((k) => ({
    key: String(k.kind),
    label: `${getKindLabel(k.kind)} (${k.count})`,
  }));

  const cachePills = CACHE_QUERY_TYPES.map((qt) => ({
    key: qt,
    label: qt,
  }));

  return (
    <div className="space-y-6">
      <ProfileHeader npubData={npubData} npub={npub} pubkeyHex={pubkeyHex} />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-zinc-800 pb-0">
        <button
          onClick={() => {
            setTab("events");
            setPage(1);
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "events"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Nostr Events
        </button>
        <button
          onClick={() => {
            setTab("cache");
            setPage(1);
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "cache"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Cache Responses
        </button>
        <button
          onClick={() => setTab("analytics")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "analytics"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Analytics
        </button>
      </div>

      {/* Search (events tab only) */}
      {tab === "events" && (
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search content and tags..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
          />
          {searchInput && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-sm"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      {tab === "events" && (
        <FilterPills
          items={kindPills}
          selected={selectedKind !== null ? String(selectedKind) : null}
          onSelect={(key) => {
            setSelectedKind(key !== null ? Number(key) : null);
            setPage(1);
          }}
        />
      )}

      {tab === "cache" && (
        <FilterPills
          items={cachePills}
          selected={cacheQueryType}
          onSelect={(key) => {
            setCacheQueryType(key);
            setPage(1);
          }}
        />
      )}

      {/* Results count */}
      {tab !== "analytics" && (
        <p className="text-sm text-zinc-500">
          {total} result{total !== 1 ? "s" : ""}
        </p>
      )}

      {/* Content */}
      {tab === "analytics" ? (
        <AnalyticsTab pubkeyHex={pubkeyHex} />
      ) : loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : tab === "events" ? (
        <div className="space-y-3">
          {events.map((e) => (
            <EventCard
              key={e.eventId}
              event={e}
              expanded={expandedEvent === e.eventId}
              onToggleExpand={() =>
                setExpandedEvent(
                  expandedEvent === e.eventId ? null : e.eventId
                )
              }
            />
          ))}
          {events.length === 0 && (
            <p className="text-sm text-zinc-500">No events found.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {cacheResponses.map((cr) => (
            <CacheResponseCard key={cr.id} response={cr} />
          ))}
          {cacheResponses.length === 0 && (
            <p className="text-sm text-zinc-500">
              No cache responses found.
            </p>
          )}
        </div>
      )}

      {tab !== "analytics" && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
    </div>
  );
}
