import { NextRequest, NextResponse } from "next/server";
import {
  isAdminPubkey,
  consumeChallenge,
  verifyAuthEvent,
  createSessionToken,
  setSessionCookie,
} from "@/lib/auth";
import type { Event } from "nostr-tools/pure";

export async function POST(request: NextRequest) {
  let body: { event?: Event };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { event } = body;
  if (!event) {
    return NextResponse.json(
      { error: "Missing event" },
      { status: 400 }
    );
  }

  // Extract challenge from tags
  const challengeTag = event.tags?.find((t) => t[0] === "challenge");
  if (!challengeTag || !challengeTag[1]) {
    return NextResponse.json(
      { error: "Missing challenge tag in event" },
      { status: 400 }
    );
  }
  const challenge = challengeTag[1];

  // Check whitelist
  if (!isAdminPubkey(event.pubkey)) {
    return NextResponse.json(
      { error: "Pubkey not authorized" },
      { status: 403 }
    );
  }

  // Consume challenge (one-time use)
  if (!consumeChallenge(challenge, event.pubkey)) {
    return NextResponse.json(
      { error: "Invalid or expired challenge" },
      { status: 400 }
    );
  }

  // Verify the signed event
  const result = verifyAuthEvent(event, challenge);
  if (!result.valid) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  // Create session
  const token = createSessionToken(event.pubkey);
  const res = NextResponse.json({
    success: true,
    pubkey: event.pubkey,
  });
  setSessionCookie(res, token);
  return res;
}
