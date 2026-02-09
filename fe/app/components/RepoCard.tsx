export default function RepoCard({ repo }: any) {
  if (!repo) return null;
  
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-4xl font-bold text-zinc-900 dark:text-white">
        {repo.full_name}
      </h2>

      <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
        {repo.description}
      </p>

      <div className="mt-6 flex gap-8 text-base text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-2">
          <span className="text-xl">⭐</span>
          <span className="font-medium">{repo.stars?.toLocaleString()}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-xl">🍴</span>
          <span className="font-medium">{repo.forks?.toLocaleString()}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-xl">🐞</span>
          <span className="font-medium">{repo.open_issues?.toLocaleString()}</span>
        </span>
      </div>
    </div>
  );
}
