import { NextRequest, NextResponse } from "next/server";
import { isAdminPubkey, createChallenge } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const pubkey = request.nextUrl.searchParams.get("pubkey");

  if (!pubkey || !/^[a-f0-9]+$/.test(pubkey)) {
    return NextResponse.json(
      { error: "Invalid pubkey hex format" },
      { status: 400 }
    );
  }

  if (!isAdminPubkey(pubkey)) {
    return NextResponse.json(
      { error: "Pubkey not authorized" },
      { status: 403 }
    );
  }

  const challenge = createChallenge(pubkey);
  return NextResponse.json({ challenge });
}
