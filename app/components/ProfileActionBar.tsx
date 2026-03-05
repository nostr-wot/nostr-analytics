"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { RELAY_URLS } from "@/lib/constants";

interface Props {
  pubkeyHex: string;
  onProfileReloaded: () => void;
}

export default function ProfileActionBar({ pubkeyHex, onProfileReloaded }: Props) {
  const { isAdmin } = useAuth();
  const [reloadingProfile, setReloadingProfile] = useState(false);
  const [recheckingRelay, setRecheckingRelay] = useState(false);
  const [deepFetching, setDeepFetching] = useState(false);
  const [fetchingOutbox, setFetchingOutbox] = useState(false);
  const [selectedRelay, setSelectedRelay] = useState(RELAY_URLS[0]);
  const [customRelay, setCustomRelay] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  if (!isAdmin) return null;

  const handleReloadProfile = async () => {
    setReloadingProfile(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile/reload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkeyHex }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error || "Failed to reload profile", type: "error" });
        return;
      }
      setMessage({
        text: `Profile reloaded — ${data.eventsFound} kind 0 event${data.eventsFound !== 1 ? "s" : ""} found`,
        type: "success",
      });
      onProfileReloaded();
    } catch {
      setMessage({ text: "Network error", type: "error" });
    } finally {
      setReloadingProfile(false);
    }
  };

  const handleRecheckRelay = async () => {
    const relayUrl = isCustom ? customRelay.trim() : selectedRelay;
    if (!relayUrl) {
      setMessage({ text: "Please enter a relay URL", type: "error" });
      return;
    }
    try {
      new URL(relayUrl);
    } catch {
      setMessage({ text: "Invalid URL", type: "error" });
      return;
    }

    setRecheckingRelay(true);
    setMessage(null);
    try {
      const res = await fetch("/api/events/recheck-relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkeyHex, relayUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error || "Failed to recheck relay", type: "error" });
        return;
      }
      setMessage({
        text: `Recheck complete — ${data.totalEvents} events found, ${data.newEvents} new`,
        type: "success",
      });
    } catch {
      setMessage({ text: "Network error", type: "error" });
    } finally {
      setRecheckingRelay(false);
    }
  };

  const handleDeepFetch = async () => {
    setDeepFetching(true);
    setMessage(null);
    try {
      const res = await fetch("/api/events/deep-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkeyHex }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error || "Failed to deep fetch", type: "error" });
        return;
      }
      setMessage({
        text: `Deep fetch complete — ${data.totalEvents} events found across all relays, ${data.newEvents} new`,
        type: "success",
      });
    } catch {
      setMessage({ text: "Network error", type: "error" });
    } finally {
      setDeepFetching(false);
    }
  };

  const handleFetchOutbox = async () => {
    setFetchingOutbox(true);
    setMessage(null);
    try {
      const res = await fetch("/api/events/fetch-outbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkeyHex }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error || "Failed to fetch outbox relays", type: "error" });
        return;
      }
      if (data.relayCount === 0) {
        setMessage({ text: "No NIP-65 outbox relays found for this profile", type: "error" });
        return;
      }
      setMessage({
        text: `Fetched from ${data.relayCount} outbox relay${data.relayCount !== 1 ? "s" : ""} — ${data.totalEvents} events found, ${data.newEvents} new`,
        type: "success",
      });
    } catch {
      setMessage({ text: "Network error", type: "error" });
    } finally {
      setFetchingOutbox(false);
    }
  };

  const anyLoading = reloadingProfile || recheckingRelay || deepFetching || fetchingOutbox;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Reload Profile */}
        <button
          onClick={handleReloadProfile}
          disabled={anyLoading}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {reloadingProfile ? "Reloading..." : "Reload Profile"}
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-zinc-700" />

        {/* Recheck Relay */}
        <div className="flex items-center gap-2">
          <select
            value={isCustom ? "__custom__" : selectedRelay}
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                setIsCustom(true);
              } else {
                setIsCustom(false);
                setSelectedRelay(e.target.value);
              }
            }}
            disabled={anyLoading}
            className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 disabled:opacity-50"
          >
            {RELAY_URLS.map((url) => (
              <option key={url} value={url}>
                {new URL(url).hostname}
              </option>
            ))}
            <option value="__custom__">Custom URL...</option>
          </select>

          {isCustom && (
            <input
              type="text"
              value={customRelay}
              onChange={(e) => setCustomRelay(e.target.value)}
              placeholder="wss://relay.example.com"
              disabled={anyLoading}
              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 w-64 disabled:opacity-50"
            />
          )}

          <button
            onClick={handleRecheckRelay}
            disabled={anyLoading}
            className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {recheckingRelay ? "Rechecking..." : "Recheck Relay"}
          </button>
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-zinc-700" />

        {/* Deep Fetch All */}
        <button
          onClick={handleDeepFetch}
          disabled={anyLoading}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {deepFetching ? "Deep Fetching..." : "Deep Fetch All"}
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-zinc-700" />

        {/* Fetch Outbox Relays */}
        <button
          onClick={handleFetchOutbox}
          disabled={anyLoading}
          className="rounded bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {fetchingOutbox ? "Fetching Outbox..." : "Fetch Outbox"}
        </button>
      </div>

      {/* Feedback message */}
      {message && (
        <p
          className={`text-sm ${
            message.type === "success" ? "text-green-400" : "text-red-400"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
