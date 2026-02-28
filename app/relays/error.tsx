"use client";

export default function RelayError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <p className="text-red-400 text-sm">
        Something went wrong loading relay status.
      </p>
      <p className="text-zinc-600 text-xs">{error.message}</p>
      <button
        onClick={reset}
        className="px-3 py-1.5 rounded bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
