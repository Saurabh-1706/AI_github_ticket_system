import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Ticket } from "@/models/Ticket";

export async function GET() {
  try {
    await connectDB();

    const tickets = await Ticket.find().sort({ createdAt: -1 });

    return NextResponse.json({ tickets }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch tickets" },
      { status: 500 }
    );
  }
}
