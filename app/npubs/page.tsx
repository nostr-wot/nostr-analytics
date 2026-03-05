"use client";

import { useEffect, useState, useCallback } from "react";
import type { ToastMessage } from "@/lib/types";
import { TOAST_DURATION_MS } from "@/lib/constants";
import { useNpubCache } from "@/lib/npub-cache";
import { useAuth } from "@/lib/auth-context";
import MessageBanner from "../components/MessageBanner";
import AddNpubForm from "../components/AddNpubForm";
import NpubTable from "../components/NpubTable";
import SchedulerLog from "../components/SchedulerLog";

export default function Home() {
  const { isAdmin } = useAuth();
  const { npubs, loading, refresh } = useNpubCache();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fetching, setFetching] = useState(false);
  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [totalEvents, setTotalEvents] = useState(0);
  const [totalCacheResponses, setTotalCacheResponses] = useState(0);
  const [message, setMessage] = useState<ToastMessage | null>(null);

  const fetchSchedulerStatus = useCallback(async () => {
    const res = await fetch("/api/collector");
    const data = await res.json();
    setSchedulerRunning(data.running);
    setTotalEvents(data.totalEvents ?? 0);
    setTotalCacheResponses(data.totalCacheResponses ?? 0);
  }, []);

  useEffect(() => {
    fetchSchedulerStatus();
  }, [fetchSchedulerStatus]);

  const showMessage = (text: string, type: "success" | "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), TOAST_DURATION_MS);
  };

  const handleAdd = async (lines: string[]) => {
    const res = await fetch("/api/npubs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ npubs: lines }),
    });
    const data = await res.json();
    const added = data.results.filter(
      (r: { status: string }) => r.status === "added"
    ).length;
    const errors = data.results.filter(
      (r: { status: string }) => r.status === "error"
    ).length;

    showMessage(
      `Added ${added}, skipped ${data.results.length - added - errors} existing, ${errors} invalid`,
      errors > 0 ? "error" : "success"
    );
    refresh();
  };

  const handleRemove = async () => {
    if (selected.size === 0) return;
    await fetch("/api/npubs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ npubs: Array.from(selected) }),
    });
    setSelected(new Set());
    showMessage(`Removed ${selected.size} npub(s)`, "success");
    refresh();
  };

  const handleFetchAll = async () => {
    setFetching(true);
    await fetch("/api/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setFetching(false);
    showMessage("Collection cycle complete", "success");
    refresh();
  };

  const handleFetchOne = async (pubkeyHex: string) => {
    setFetching(true);
    await fetch("/api/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pubkeyHex }),
    });
    setFetching(false);
    showMessage("Fetch complete", "success");
    refresh();
  };

  const toggleScheduler = async () => {
    const action = schedulerRunning ? "stop" : "start";
    const res = await fetch("/api/collector", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    setSchedulerRunning(data.running);
    showMessage(
      data.running ? "Scheduler started" : "Scheduler stopped",
      "success"
    );
  };

  const toggleSelect = (npub: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(npub)) next.delete(npub);
      else next.add(npub);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === npubs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(npubs.map((n) => n.npub)));
    }
  };

  return (
    <div className="space-y-8">
      <MessageBanner message={message} />

      {/* Controls bar */}
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={toggleScheduler}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              schedulerRunning
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-emerald-600 hover:bg-emerald-700 text-white"
            }`}
          >
            {schedulerRunning ? "Stop Scheduler" : "Start Scheduler"}
          </button>
          <button
            onClick={handleFetchAll}
            disabled={fetching || npubs.length === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {fetching ? "Fetching..." : "Fetch All Now"}
          </button>
          <span className="text-sm text-zinc-500">
            {schedulerRunning ? "Auto-fetching every 10 min" : "Scheduler off"}
          </span>
        </div>
      )}

      {/* Stats */}
      {isAdmin && (
        <div className="flex gap-4 text-sm text-zinc-400">
          <span>{totalEvents.toLocaleString()} events</span>
          <span>{totalCacheResponses.toLocaleString()} cache responses</span>
        </div>
      )}

      {isAdmin && <SchedulerLog running={schedulerRunning} />}

      {isAdmin && <AddNpubForm onAdd={handleAdd} />}

      <NpubTable
        npubs={npubs}
        selected={selected}
        loading={loading}
        fetching={fetching}
        isAdmin={isAdmin}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
        onRemove={handleRemove}
        onFetchOne={handleFetchOne}
      />
    </div>
  );
}
