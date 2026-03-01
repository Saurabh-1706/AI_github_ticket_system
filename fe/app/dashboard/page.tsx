"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchGlobalAnalytics,
  type GlobalAnalytics,
  type GlobalIssue,
} from "../services/github";
import SearchModal from "../components/SearchModal";

const TYPE_COLORS: Record<string, string> = {
  bug: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  feature: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  security: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  performance: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  documentation: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  question: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const CRIT_COLORS: Record<string, string> = {
  critical: "bg-red-500 text-white",
  high: "bg-orange-400 text-white",
  medium: "bg-yellow-400 text-zinc-900",
  low: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
};

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<GlobalAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [stateFilter, setStateFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [critFilter, setCritFilter] = useState("");

  const load = async (st = stateFilter, ty = typeFilter, cr = critFilter) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchGlobalAnalytics({
        state: st || undefined,
        issue_type: ty || undefined,
        criticality: cr || undefined,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const applyFilters = () => load(stateFilter, typeFilter, critFilter);
  const clearFilters = () => {
    setStateFilter("");
    setTypeFilter("");
    setCritFilter("");
    load("", "", "");
  };

  const goToIssue = (issue: GlobalIssue) =>
    router.push(`/repository?owner=${issue.owner}&repo=${issue.repo}&issue=${issue.number}`);

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-800">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">🌐 Multi-Repo Dashboard</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Unified view of issues across all your cached repositories
            </p>
          </div>
          <SearchModal />
        </div>

        {/* KPI row */}
        {data && (
          <div className="mb-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
              <p className="text-xs uppercase tracking-wide text-zinc-400">Total Issues</p>
              <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-white">{data.total}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
              <p className="text-xs uppercase tracking-wide text-zinc-400">Repositories</p>
              <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-white">{data.by_repo.length}</p>
            </div>
            {Object.entries(data.by_type).slice(0, 2).map(([type, count]) => (
              <div key={type} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
                <p className="text-xs uppercase tracking-wide text-zinc-400 capitalize">{type}</p>
                <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-white">{count}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          >
            <option value="">All States</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          >
            <option value="">All Types</option>
            {["bug", "feature", "documentation", "security", "performance", "question", "enhancement"].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={critFilter}
            onChange={(e) => setCritFilter(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          >
            <option value="">All Criticality</option>
            {["critical", "high", "medium", "low"].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button onClick={applyFilters}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Apply
          </button>
          {(stateFilter || typeFilter || critFilter) && (
            <button onClick={clearFilters}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400">
              Clear
            </button>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-indigo-500" />
          </div>
        )}

        {error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20">{error}</p>}

        {data && !loading && (
          <div className="grid gap-6 lg:grid-cols-4">
            {/* Repo breakdown sidebar */}
            <div className="lg:col-span-1">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">By Repository</h2>
              <div className="space-y-2">
                {data.by_repo.map((r) => (
                  <button
                    key={r.full_name}
                    onClick={() => router.push(`/repository?owner=${r.owner}&repo=${r.repo}`)}
                    className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-white p-3 text-left hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {r.full_name || `${r.owner}/${r.repo}`}
                    </span>
                    <span className="ml-2 shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                      {r.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Issues feed */}
            <div className="lg:col-span-3">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Recent Issues ({data.issues.length})
              </h2>
              {data.issues.length === 0 ? (
                <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-800">
                  <p className="text-sm text-zinc-500">No issues match the current filters</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.issues.map((issue) => (
                    <button
                      key={`${issue.owner}/${issue.repo}#${issue.number}`}
                      onClick={() => goToIssue(issue)}
                      className="flex w-full items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-left transition-all hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800"
                    >
                      {/* State dot */}
                      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                        issue.state === "open" ? "bg-green-500" : "bg-zinc-400"
                      }`} />

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-xs text-zinc-400">{issue.owner}/{issue.repo} #{issue.number}</span>
                          {issue.type && (
                            <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${TYPE_COLORS[issue.type] ?? "bg-zinc-100 text-zinc-600"}`}>
                              {issue.type}
                            </span>
                          )}
                          {issue.criticality && (
                            <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${CRIT_COLORS[issue.criticality] ?? ""}`}>
                              {issue.criticality}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
                          {issue.title}
                        </p>
                      </div>

                      {issue.created_at && (
                        <span className="shrink-0 text-xs text-zinc-400">
                          {new Date(issue.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
