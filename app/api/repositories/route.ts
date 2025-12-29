import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Repository } from "@/models/Repository";

export async function GET() {
  await connectDB();
  const repos = await Repository.find().sort({ createdAt: -1 });
  return NextResponse.json({ repositories: repos });
}
