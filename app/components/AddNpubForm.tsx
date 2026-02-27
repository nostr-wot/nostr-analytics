"use client";

import { useState } from "react";

export default function AddNpubForm({
  onAdd,
}: {
  onAdd: (lines: string[]) => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const lines = input
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    setAdding(true);
    await onAdd(lines);
    setInput("");
    setAdding(false);
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <h2 className="mb-4 text-lg font-semibold">Add npubs</h2>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste npubs here, one per line or comma-separated..."
        rows={4}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
      />
      <button
        onClick={handleAdd}
        disabled={adding || !input.trim()}
        className="mt-3 rounded-lg bg-violet-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
      >
        {adding ? "Adding..." : "Add"}
      </button>
    </div>
  );
}
