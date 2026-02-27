"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { TrackedNpubWithStats } from "@/lib/types";

const CACHE_KEY = "npub-cache";
const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: TrackedNpubWithStats[];
  timestamp: number;
}

// Module-level singletons (survive client-side navigation)
let memoryCache: CacheEntry | null = null;
let inflightPromise: Promise<TrackedNpubWithStats[]> | null = null;

function readLocalStorage(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function writeLocalStorage(data: TrackedNpubWithStats[]) {
  try {
    const entry: CacheEntry = { data, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable — ignore
  }
}

async function fetchFromApi(): Promise<TrackedNpubWithStats[]> {
  const res = await fetch("/api/npubs");
  return res.json();
}

export function useNpubCache() {
  const [npubs, setNpubs] = useState<TrackedNpubWithStats[]>(
    memoryCache?.data ?? []
  );
  const [loading, setLoading] = useState(!memoryCache);
  const mountedRef = useRef(true);

  const load = useCallback(async (force: boolean) => {
    // Return memory cache if valid and not forced
    if (!force && memoryCache && Date.now() - memoryCache.timestamp < TTL_MS) {
      setNpubs(memoryCache.data);
      setLoading(false);
      return;
    }

    // Check localStorage if no memory cache and not forced
    if (!force && !memoryCache) {
      const ls = readLocalStorage();
      if (ls) {
        memoryCache = ls;
        setNpubs(ls.data);
        setLoading(false);
        return;
      }
    }

    // Deduplicate concurrent fetches
    if (!inflightPromise) {
      inflightPromise = fetchFromApi().finally(() => {
        inflightPromise = null;
      });
    }

    setLoading(true);
    try {
      const data = await inflightPromise;
      memoryCache = { data, timestamp: Date.now() };
      writeLocalStorage(data);
      if (mountedRef.current) {
        setNpubs(data);
        setLoading(false);
      }
    } catch {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load(false);
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const refresh = useCallback(async () => {
    memoryCache = null;
    inflightPromise = null;
    await load(true);
  }, [load]);

  const getByNpub = useCallback(
    (npubOrHex: string): TrackedNpubWithStats | undefined => {
      const source = memoryCache?.data ?? npubs;
      return source.find(
        (n) => n.npub === npubOrHex || n.pubkeyHex === npubOrHex
      );
    },
    [npubs]
  );

  return { npubs, loading, refresh, getByNpub };
}
