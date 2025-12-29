import Link from "next/link";

type Repository = {
  _id: string;
  fullName: string;
  description?: string;
};

export default async function RepositoriesPage() {
  const res = await fetch("http://localhost:3000/api/repositories", {
    cache: "no-store",
  });
  const { repositories } = await res.json();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">📦 Repositories</h1>

      <div className="grid gap-4 md:grid-cols-2">
        {repositories.map((repo: Repository) => (
          <Link
            key={repo._id}
            href={`/repositories/${encodeURIComponent(repo.fullName)}`}
            className="border rounded p-4 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <h2 className="font-semibold">{repo.fullName}</h2>
            <p className="text-sm text-gray-500">
              {repo.description || "No description"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
