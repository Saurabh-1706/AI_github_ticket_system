interface RepoCardProps {
  repo: any;
}

export default function RepoCard({ repo }: any) {
  if (!repo) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">
            {repo.full_name}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {repo.description}
          </p>
        </div>

        <div className="flex gap-4 text-sm text-slate-600">
          ⭐ {repo.stargazers_count}
          🍴 {repo.forks_count}
        </div>
      </div>
    </div>
  );
}

