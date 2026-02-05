export default function RepoCard({ repo }: any) {
  if (!repo) return null;
  
  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">
        {repo.full_name}
      </h2>

      <p className="mt-2 text-sm text-zinc-600">
        {repo.description}
      </p>

      <div className="mt-4 flex gap-6 text-sm text-zinc-500">
        <span>⭐ {repo.stars}</span>
        <span>🍴 {repo.forks}</span>
        <span>🐞 {repo.open_issues}</span>
      </div>
    </div>
  );
}
