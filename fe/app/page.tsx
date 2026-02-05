"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import RepoInput from "./components/RepoInput";
import { fetchSavedRepos } from "./services/github";

/* ✅ Define a proper type */
interface SavedRepo {
  owner: string;
  repo: string;
  full_name: string;
  stars: number;
  language: string;
}

export default function Home() {
  const router = useRouter();

  /* ✅ Hooks MUST be inside component */
  const [savedRepos, setSavedRepos] = useState<SavedRepo[]>([]);

  useEffect(() => {
    fetchSavedRepos()
      .then(setSavedRepos)
      .catch(console.error);
  }, []);

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center px-6">
      <div className="w-full max-w-3xl">
        {/* Card */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {/* App Name */}
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Git IntelliSolve
          </h1>

          {/* Tagline */}
          <p className="mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
            AI-powered GitHub issue analysis. Detect duplicates, analyze
            criticality, and reuse proven solutions — instantly.
          </p>

          {/* Input Section */}
          <div className="mt-8">
            <RepoInput />
          </div>

          {/* Footer hint */}
          <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-500">
            Example: https://github.com/facebook/react
          </p>
        </div>

        {/* Saved repos */}
        <div className="mt-10 text-zinc-900 dark:text-zinc-100">
          <h2 className="text-lg font-semibold mb-4">
            Previously Analyzed Repositories
          </h2>

          {savedRepos.length === 0 && (
            <p className="text-zinc-500">No repositories analyzed yet.</p>
          )}

          <ul className="space-y-3">
            {savedRepos.map((repo) => (
              <li
                key={repo.full_name}
                className="cursor-pointer rounded-lg border p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                onClick={() =>
                  router.push(
                    `/repository?owner=${repo.owner}&repo=${repo.repo}`
                  )
                }
              >
                <div className="font-medium">{repo.full_name}</div>
                <div className="text-sm text-zinc-500">
                  ⭐ {repo.stars} · {repo.language}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
