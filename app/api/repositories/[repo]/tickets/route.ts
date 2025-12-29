import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Ticket } from "@/models/Ticket";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ repo: string }> }
) {
  await connectDB();

  const { repo } = await context.params;
  const repoFullName = decodeURIComponent(repo);

  const tickets = await Ticket.find({
    repository: repoFullName,
  }).sort({ createdAt: -1 });

  return NextResponse.json({ tickets });
}
