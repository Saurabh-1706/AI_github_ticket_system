type Ticket = {
  _id: string;
  title: string;
  type: string;
  status: string;
};

export default async function RepoTicketsPage({
  params,
}: {
  params: { repo: string };
}) {
  const repo = decodeURIComponent(params.repo);

  const res = await fetch(
    `http://localhost:3000/api/repositories/${params.repo}/tickets`,
    { cache: "no-store" }
  );

  const { tickets } = await res.json();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">🐞 {repo}</h1>

      <div className="space-y-3">
        {tickets.map((ticket: Ticket) => (
          <div
            key={ticket._id}
            className="border rounded p-4 bg-white dark:bg-gray-900"
          >
            <h3 className="font-semibold">{ticket.title}</h3>
            <div className="flex gap-2 mt-2 text-sm">
              <span className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">
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
