import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  console.log("🔥 GITHUB WEBHOOK HIT (NO AUTH)");

  const payload = await req.json();
  console.log("Action:", payload.action);

  return NextResponse.json({ ok: true });
}
