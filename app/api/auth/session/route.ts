import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, isAdminPubkey } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ pubkey: null, isAdmin: false });
  }

  return NextResponse.json({
    pubkey: session.pubkey,
    isAdmin: isAdminPubkey(session.pubkey),
  });
}
