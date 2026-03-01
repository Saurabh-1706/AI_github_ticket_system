"use client";

import { useEffect, useState } from "react";
import { fetchPRStats, type PRStats } from "../services/github";

interface RepoCardProps {
  repo: any;
}

export default function RepoCard({ repo }: RepoCardProps) {
  const [prStats, setPrStats] = useState<PRStats | null>(null);

  useEffect(() => {
    if (!repo?.owner || !repo?.repo) return;
    fetchPRStats(repo.owner, repo.repo)
      .then(setPrStats)
      .catch(() => setPrStats(null));
  }, [repo?.owner, repo?.repo]);

  if (!repo) return null;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-4xl font-bold text-zinc-900 dark:text-white">
        {repo.full_name}
      </h2>

      <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
        {repo.description}
      </p>

      {/* Repo stats */}
      <div className="mt-6 flex flex-wrap gap-6 text-base text-zinc-500 dark:text-zinc-400">
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

      {/* PR Stats */}
      {prStats && (
        <div className="mt-4 flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            {prStats.open_prs} Open PRs
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            <span className="h-2 w-2 rounded-full bg-zinc-400" />
            {prStats.closed_prs} Closed PRs
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            {prStats.total_prs} Total PRs
          </span>
        </div>
      )}
    </div>
  );
}
