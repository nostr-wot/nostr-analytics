import { nip19 } from "nostr-tools";

export function npubToHex(npub: string): string {
  const decoded = nip19.decode(npub);
  if (decoded.type !== "npub") {
    throw new Error(`Expected npub, got ${decoded.type}`);
  }
  return decoded.data;
}

export function hexToNpub(hex: string): string {
  return nip19.npubEncode(hex);
}

export function isValidNpub(npub: string): boolean {
  try {
    const decoded = nip19.decode(npub);
    return decoded.type === "npub";
  } catch {
    return false;
  }
}

export function isValidHexPubkey(hex: string): boolean {
  return /^[0-9a-f]{64}$/i.test(hex);
}

/**
 * Accepts either an npub or a 64-char hex pubkey.
 * Returns both representations, or null if invalid.
 */
export function resolveInput(input: string): { npub: string; pubkeyHex: string } | null {
  if (isValidNpub(input)) {
    return { npub: input, pubkeyHex: npubToHex(input) };
  }
  if (isValidHexPubkey(input)) {
    return { npub: hexToNpub(input), pubkeyHex: input.toLowerCase() };
  }
  return null;
}
