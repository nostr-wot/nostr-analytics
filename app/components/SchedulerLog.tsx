"use client";

import { useEffect, useRef, useState } from "react";

export default function SchedulerLog({ running }: { running: boolean }) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState("");
  const logRef = useRef<HTMLPreElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!open) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    const es = new EventSource("/api/collector/log/stream");
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const text = JSON.parse(event.data);
        setLog((prev) => {
          const updated = prev + text;
          const lines = updated.split("\n");
          if (lines.length > 200) {
            return lines.slice(-200).join("\n");
          }
          return updated;
        });
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-zinc-300 hover:text-zinc-100"
      >
        <span className="flex items-center gap-2">
          Scheduler Log
          {running && (
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </span>
        <span className="text-zinc-500">{open ? "\u25B2" : "\u25BC"}</span>
      </button>
      {open && (
        <pre
          ref={logRef}
          className="max-h-64 overflow-auto border-t border-zinc-800 px-4 py-3 font-mono text-xs text-zinc-400"
        >
          {log || "No log output yet. Start the scheduler to see logs."}
        </pre>
      )}
    </div>
  );
}
