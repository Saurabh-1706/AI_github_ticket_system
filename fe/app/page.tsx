"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "./components/AuthProvider";
import UserMenu from "./components/UserMenu";
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
  const { isAuthenticated, isLoading } = useAuth();

  /* ✅ Hooks MUST be inside component */
  const [savedRepos, setSavedRepos] = useState<SavedRepo[]>([]);

  useEffect(() => {
    // Fetch saved repos with auth token if available
    const loadRepos = async () => {
      try {
        const token = localStorage.getItem("auth_token");
        const repos = await fetchSavedRepos(token || undefined);
        setSavedRepos(repos);
      } catch (error) {
        console.error("Failed to fetch saved repos:", error);
      }
    };
    
    loadRepos();
  }, [isAuthenticated]); // Refetch when auth state changes

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Header with Auth */}
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
              Git IntelliSolve
            </h1>
            
            {/* Auth Section */}
            <div className="flex items-center gap-4">
              {!isLoading && (
                <>
                  {isAuthenticated ? (
                    <UserMenu />
                  ) : (
                    <div className="flex items-center gap-3">
                      <Link
                        href="/login"
                        className="text-sm font-medium text-zinc-700 transition-colors hover:text-black dark:text-zinc-300 dark:hover:text-white"
                      >
                        Sign in
                      </Link>
                      <Link
                        href="/register"
                        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                      >
                        Sign up
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-3xl">
          {/* Card */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            {/* App Name */}
            <h2 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              AI-Powered GitHub Issue Analysis
            </h2>

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
            <h3 className="text-lg font-semibold mb-4">
              Previously Analyzed Repositories
            </h3>

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
    </div>
  );
}
