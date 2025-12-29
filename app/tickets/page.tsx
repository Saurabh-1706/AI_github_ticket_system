import React from "react";

type Ticket = {
  _id: string;
  githubIssueId: string;
  title: string;
  description?: string;
  type: "bug" | "feature" | "question" | "unknown";
  status: "open" | "solved";
};

async function getTickets(): Promise<Ticket[]> {
  const res = await fetch("http://localhost:3000/api/tickets", {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to fetch tickets");
  }

  const data = await res.json();
  return data.tickets as Ticket[];
}

export default async function TicketsPage() {
  const tickets = await getTickets();

  return (
    <div className="p-4 md:p-8">
      <h2 className="text-xl md:text-2xl font-bold mb-6">📋 Tickets</h2>

      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {tickets.map((ticket) => (
          <div
            key={ticket._id}
            className="rounded-lg border p-4 bg-white dark:bg-gray-800 shadow-sm"
          >
            <h3 className="font-semibold">{ticket.title}</h3>

            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {ticket.githubIssueId}
            </p>

            <div className="mt-3 flex justify-between text-sm">
              <span className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700">
                {ticket.type}
              </span>
              <span>{ticket.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
