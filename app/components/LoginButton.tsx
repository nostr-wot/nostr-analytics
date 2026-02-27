"use client";

import { useAuth } from "@/lib/auth-context";

export default function LoginButton() {
  const { pubkey, isAdmin, loading, hasExtension, error, login, logout } =
    useAuth();

  if (loading) {
    return (
      <div className="h-8 w-20 animate-pulse rounded-lg bg-zinc-800" />
    );
  }

  if (pubkey) {
    return (
      <div className="flex items-center gap-3">
        {isAdmin && (
          <span className="rounded bg-violet-600/20 px-2 py-0.5 text-xs font-medium text-violet-300">
            admin
          </span>
        )}
        <span className="font-mono text-xs text-zinc-400">
          {pubkey.slice(0, 8)}...{pubkey.slice(-4)}
        </span>
        <button
          onClick={logout}
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
        >
          Logout
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
      <button
        onClick={login}
        disabled={!hasExtension}
        className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        title={hasExtension ? "Login with Nostr extension" : "No Nostr extension detected"}
      >
        {hasExtension ? "Login" : "No Extension"}
      </button>
    </div>
  );
}
