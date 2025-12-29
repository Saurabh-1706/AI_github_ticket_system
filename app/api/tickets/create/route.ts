import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Ticket } from "@/models/Ticket";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { githubIssueId, title, description } = body;

    if (!githubIssueId || !title) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    await connectDB();

    const ticket = await Ticket.create({
      githubIssueId,
      title,
      description,
    });

    return NextResponse.json(
      { message: "Ticket saved", ticket },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
