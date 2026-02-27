import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, randomBytes } from "@noble/hashes/utils.js";
import { verifyEvent, type Event } from "nostr-tools/pure";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Admin whitelist
// ---------------------------------------------------------------------------

const ADMIN_PUBKEYS = new Set([
  "419b7df0b0701bc75c7a105722549dd16220c41f51e79d92b7697d6e7124181a",
  "d9590d95a7811e1cb312be66edd664d7e3e6ed57822ad9f213ed620fc6748be8",
]);

export function isAdminPubkey(hex: string): boolean {
  return ADMIN_PUBKEYS.has(hex);
}

// ---------------------------------------------------------------------------
// Challenge store (in-memory, single-server)
// ---------------------------------------------------------------------------

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface StoredChallenge {
  pubkey: string;
  expiresAt: number;
}

const challenges = new Map<string, StoredChallenge>();

function cleanupExpiredChallenges() {
  const now = Date.now();
  for (const [key, val] of challenges) {
    if (val.expiresAt <= now) challenges.delete(key);
  }
}

export function createChallenge(pubkey: string): string {
  cleanupExpiredChallenges();
  const challenge = bytesToHex(randomBytes(32));
  challenges.set(challenge, {
    pubkey,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
  return challenge;
}

export function consumeChallenge(
  challenge: string,
  pubkey: string
): boolean {
  cleanupExpiredChallenges();
  const stored = challenges.get(challenge);
  if (!stored) return false;
  if (stored.pubkey !== pubkey) return false;
  if (stored.expiresAt <= Date.now()) return false;
  challenges.delete(challenge);
  return true;
}

// ---------------------------------------------------------------------------
// HMAC session tokens
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const COOKIE_NAME = "nostr-session";

function getSecret(): Uint8Array {
  if (!process.env.SESSION_SECRET) {
    // In development, fall back to a deterministic secret.
    // In production you should set SESSION_SECRET env var.
    return new TextEncoder().encode(
      "primal-collector-dev-secret-change-me"
    );
  }
  return new TextEncoder().encode(process.env.SESSION_SECRET);
}

function sign(payload: string): string {
  const mac = hmac(sha256, getSecret(), new TextEncoder().encode(payload));
  return bytesToHex(mac);
}

export function createSessionToken(pubkey: string): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = JSON.stringify({ pubkey, exp });
  const encoded = Buffer.from(payload).toString("base64url");
  const sig = sign(encoded);
  return `${encoded}.${sig}`;
}

function verifySessionToken(
  token: string
): { pubkey: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (sign(encoded) !== sig) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString()
    );
    if (typeof payload.pubkey !== "string") return null;
    if (typeof payload.exp !== "number") return null;
    if (payload.exp <= Date.now()) return null;
    return { pubkey: payload.pubkey };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

export function setSessionCookie(
  res: NextResponse,
  token: string
): void {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

// ---------------------------------------------------------------------------
// Session from request
// ---------------------------------------------------------------------------

export function getSessionFromRequest(
  req: NextRequest
): { pubkey: string } | null {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// ---------------------------------------------------------------------------
// Verify NIP-07 auth event
// ---------------------------------------------------------------------------

const AUTH_EVENT_KIND = 27235;
const EVENT_TIMESTAMP_TOLERANCE_S = 60 * 10; // 10 minutes

export function verifyAuthEvent(
  event: Event,
  challenge: string
): { valid: true } | { valid: false; error: string } {
  // Check kind
  if (event.kind !== AUTH_EVENT_KIND) {
    return { valid: false, error: "Invalid event kind" };
  }

  // Check timestamp
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(event.created_at - now) > EVENT_TIMESTAMP_TOLERANCE_S) {
    return { valid: false, error: "Event timestamp too far from current time" };
  }

  // Check challenge tag
  const challengeTag = event.tags.find(
    (t) => t[0] === "challenge" && t[1] === challenge
  );
  if (!challengeTag) {
    return { valid: false, error: "Challenge tag missing or mismatch" };
  }

  // Verify signature
  if (!verifyEvent(event)) {
    return { valid: false, error: "Invalid event signature" };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Route guard
// ---------------------------------------------------------------------------

export function requireAuth(
  req: NextRequest
): { pubkey: string } | NextResponse {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }
  if (!isAdminPubkey(session.pubkey)) {
    return NextResponse.json(
      { error: "Forbidden: not an admin" },
      { status: 403 }
    );
  }
  return { pubkey: session.pubkey };
}
