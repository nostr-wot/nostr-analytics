"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

interface AuthState {
  pubkey: string | null;
  isAdmin: boolean;
  loading: boolean;
  hasExtension: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  pubkey: null,
  isAdmin: false,
  loading: true,
  hasExtension: false,
  error: null,
  login: async () => {},
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// NIP-07 type declarations
declare global {
  interface Window {
    nostr?: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: {
        kind: number;
        created_at: number;
        tags: string[][];
        content: string;
      }) => Promise<{
        id: string;
        pubkey: string;
        created_at: number;
        kind: number;
        tags: string[][];
        content: string;
        sig: string;
      }>;
    };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasExtension, setHasExtension] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for NIP-07 extension (with retry for async injection)
  useEffect(() => {
    const check = () => {
      if (window.nostr) {
        setHasExtension(true);
        return true;
      }
      return false;
    };

    if (!check()) {
      // Some extensions inject asynchronously
      const timer = setTimeout(check, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Hydrate session from cookie on mount
  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data: { pubkey: string | null; isAdmin: boolean }) => {
        setPubkey(data.pubkey);
        setIsAdmin(data.isAdmin);
      })
      .catch(() => {
        // Session fetch failed, stay logged out
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async () => {
    setError(null);

    if (!window.nostr) {
      setError("No Nostr extension found");
      return;
    }

    try {
      // Step 1: Get pubkey from extension
      const pk = await window.nostr.getPublicKey();

      // Step 2: Request challenge
      const challengeRes = await fetch(
        `/api/auth/challenge?pubkey=${pk}`
      );
      const challengeData = await challengeRes.json();

      if (!challengeRes.ok) {
        setError(challengeData.error || "Failed to get challenge");
        return;
      }

      // Step 3: Sign auth event
      const signedEvent = await window.nostr.signEvent({
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["challenge", challengeData.challenge]],
        content: "",
      });

      // Step 4: Verify with server
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: signedEvent }),
      });
      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        setError(verifyData.error || "Verification failed");
        return;
      }

      setPubkey(verifyData.pubkey);
      setIsAdmin(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Login failed"
      );
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setPubkey(null);
    setIsAdmin(false);
    setError(null);
  }, []);

  return (
    <AuthContext value={{ pubkey, isAdmin, loading, hasExtension, error, login, logout }}>
      {children}
    </AuthContext>
  );
}
