"use client";

import type { ToastMessage } from "@/lib/types";

export default function MessageBanner({
  message,
}: {
  message: ToastMessage | null;
}) {
  if (!message) return null;

  return (
    <div
      className={`rounded-lg px-4 py-3 text-sm font-medium ${
        message.type === "success"
          ? "bg-emerald-900/50 text-emerald-200 border border-emerald-800"
          : "bg-red-900/50 text-red-200 border border-red-800"
      }`}
    >
      {message.text}
    </div>
  );
}
