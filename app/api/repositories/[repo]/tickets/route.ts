import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Ticket } from "@/models/Ticket";

export async function GET(
  req: Request,
  { params }: { params: { repo: string } }
) {
  await connectDB();

  const repoFullName = decodeURIComponent(params.repo);

  const tickets = await Ticket.find({
    repository: repoFullName,
  }).sort({ createdAt: -1 });

  return NextResponse.json({ tickets });
}

