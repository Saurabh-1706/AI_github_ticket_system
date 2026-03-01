"use client";

import { useEffect, useState } from "react";
import { fetchRepositories, deleteRepository, type Repository } from "../services/github";
import RepositoryCard from "../components/RepositoryCard";
import LoadingSpinner from "../components/LoadingSpinner";

export default function RepositoriesPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRepositories();
  }, []);

  const loadRepositories = async () => {
    try {
      setLoading(true);
      setError(null);
      const authToken = typeof window !== "undefined" ? localStorage.getItem("auth_token") ?? undefined : undefined;
      const repos = await fetchRepositories(authToken);
      // Filter out invalid repositories (null or undefined names)
      const validRepos = repos.filter(r => r.name && r.name !== "null" && r.name !== "None");
      setRepositories(validRepos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load repositories");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (owner: string, repo: string) => {
    try {
      await deleteRepository(owner, repo);
      // Remove from list
      setRepositories(prev => prev.filter(r => !(r.owner === owner && r.name === repo)));
    } catch (err) {
      console.error("Failed to delete repository:", err);
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600">Error</h2>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">{error}</p>
          <button
            onClick={loadRepositories}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-800">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-white">
            My Repositories
          </h1>
          <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
            Manage your analyzed repositories
          </p>
        </div>

        {/* Stats */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800">
            <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
              Total Repositories
            </div>
            <div className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">
              {repositories.length}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800">
            <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
              Total Issues
            </div>
            <div className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">
              {repositories.reduce((sum, r) => sum + r.issue_count, 0)}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800">
            <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
              Recently Synced
            </div>
            <div className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">
              {repositories.filter(r => {
                const lastSync = new Date(r.last_synced);
                const now = new Date();
                return (now.getTime() - lastSync.getTime()) < 86400000; // 24 hours
              }).length}
            </div>
          </div>
        </div>

        {/* Repository grid */}
        {repositories.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-800">
            <svg
              className="mx-auto h-16 w-16 text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
            <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-white">
              No repositories yet
            </h3>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              Analyze your first repository to get started
            </p>
            <a
              href="/"
              className="mt-4 inline-block rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
            >
              Go to Home
            </a>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {repositories.map((repo) => (
              <RepositoryCard
                key={repo.full_name}
                repository={repo}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
