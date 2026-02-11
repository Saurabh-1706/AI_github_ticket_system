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

        

        {/* Recently Analyzed Repositories */}
        <RecentlyAnalyzedRepos />

      </div>
    </div>
  );
}

// Recently Analyzed Repositories Component
function RecentlyAnalyzedRepos() {
  const [repositories, setRepositories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const loadRepos = async () => {
      try {
        const { fetchRepositories } = await import("./services/github");
        const repos = await fetchRepositories();
        // Get latest 3
        setRepositories(repos.slice(0, 3));
      } catch (error) {
        console.error("Failed to load repositories:", error);
      } finally {
        setLoading(false);
      }
    };

    loadRepos();
  }, []);

  if (loading || repositories.length === 0) {
    return null;
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="mt-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
            Recently Analyzed Repositories
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Your latest analyzed repositories
          </p>
        </div>
        <Link
          href="/repositories"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          View All →
        </Link>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {repositories.map((repo) => (
          <div
            key={repo.full_name}
            onClick={() => router.push(`/repository?owner=${repo.owner}&repo=${repo.name}`)}
            className="group cursor-pointer rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition-all hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800"
          >
            {/* Repository icon */}
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white truncate">
                  {repo.name}
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
                  {repo.owner}
                </p>
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">Issues</span>
                <span className="font-medium text-zinc-900 dark:text-white">
                  {repo.issue_count}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">Last synced</span>
                <span className="font-medium text-zinc-900 dark:text-white">
                  {formatDate(repo.last_synced)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
