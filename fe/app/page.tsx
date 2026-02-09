"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "./components/AuthProvider";
import UserMenu from "./components/UserMenu";
import RepoInput from "./components/RepoInput";
import { fetchSavedRepos } from "./services/github";

interface SavedRepo {
  owner: string;
  repo: string;
  full_name: string;
  stars: number;
  language: string;
  description?: string;
}

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [savedRepos, setSavedRepos] = useState<SavedRepo[]>([]);

  useEffect(() => {
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
  }, [isAuthenticated]);

  return (
    <div className="min-h-screen">
      {/* Top Header */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                Dashboard
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                AI-powered GitHub issue analysis
              </p>
            </div>
            
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
                        className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Sign In
                      </Link>
                      <Link
                        href="/register"
                        className="rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition-all hover:shadow-xl"
                      >
                        Get Started
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
      <div className="p-6">
        {/* Hero Section */}
        <div className="mb-8 rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 p-8 dark:from-blue-950/20 dark:to-purple-950/20">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mb-4 text-4xl font-bold text-zinc-900 dark:text-white">
              Analyze GitHub Issues with AI
            </h2>
            <p className="mb-6 text-lg text-zinc-600 dark:text-zinc-400">
              Get intelligent categorization, duplicate detection, and AI-powered solutions
            </p>
            
            {/* Repository Input */}
            <div className="mx-auto max-w-2xl">
              <RepoInput />
            </div>
          </div>
        </div>

        {/* Previously Analyzed Repositories */}
        {savedRepos.length > 0 && (
          <div>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
                  Previously Analyzed Repositories
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {isAuthenticated ? "Your analyzed repositories" : "Recently analyzed"}
                </p>
              </div>
            </div>

            {/* Repository Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {savedRepos.map((repo) => (
                <Link
                  key={repo.full_name}
                  href={`/repository?owner=${repo.owner}&repo=${repo.repo}`}
                  className="group rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition-all hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-zinc-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                        {repo.repo}
                      </h3>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {repo.owner}
                      </p>
                    </div>
                  </div>

                  {repo.description && (
                    <p className="mb-4 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                      {repo.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
                    {repo.language && (
                      <div className="flex items-center gap-1">
                        <span className="h-3 w-3 rounded-full bg-blue-500"></span>
                        <span>{repo.language}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <span>⭐</span>
                      <span>{repo.stars?.toLocaleString() || 0}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {savedRepos.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mx-auto max-w-md">
              <div className="mb-4 text-6xl">🔍</div>
              <h3 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-white">
                No repositories analyzed yet
              </h3>
              <p className="mb-6 text-zinc-600 dark:text-zinc-400">
                Start by entering a GitHub repository above to analyze its issues
              </p>
              {!isAuthenticated && (
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-3 font-medium text-white shadow-lg transition-all hover:shadow-xl"
                >
                  Sign up to save your analysis
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
